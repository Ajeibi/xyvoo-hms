import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { postWalkInFolioBundle } from "@/lib/hms/folio";
import { notifyVipArrival, notifyWalkInCheckIn } from "@/lib/hms/notification-rules";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { guestTitleFromPayload, NATIONAL_ID_ID_EXPIRY_PLACEHOLDER, resolveGuestIdExpiry, walkInCheckInPayloadSchema } from "@/lib/hms/walk-in-check-in-payload";
import type { AccompanyingAdultGuest, MinorGuest, WalkInCheckInPayload } from "@/lib/hms/walk-in-check-in-payload";
import {
  assertWithinRoomTypeOccupancy,
  calendarNightsBetween,
  computeWalkInRoomPricing,
  nightlyBarBeforeDiscount,
} from "@/lib/hms/walk-in-pricing";

async function assertTenantMember(tenantId: string, userId: string) {
  const service = createServerSupabaseClient();
  const { data: membership } = await service
    .schema("hotel")
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(membership);
}

function uniqueCode(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}${rand}`;
}

function toUtcIso(date: string, time: string) {
  return `${date}T${time}:00.000Z`;
}

function buildChildrenJson(children: number, infants: number): unknown[] {
  const rows: unknown[] = [];
  for (let i = 0; i < children; i += 1) rows.push({ type: "child" });
  for (let i = 0; i < infants; i += 1) rows.push({ type: "infant" });
  return rows;
}

type GuestInsertContact = { phone: string; email: string };

async function insertGuestProfile(
  service: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  fields: {
    title: string | null;
    firstName: string;
    lastName: string;
    nationality: string;
    idType: "passport" | "national_id" | "drivers_license";
    idNumber: string;
    idExpiryDate: string;
    dateOfBirth: string;
    phone: string;
    email: string;
  },
) {
  const { data: guest, error } = await service
    .schema("hotel")
    .from("guests")
    .insert({
      tenant_id: tenantId,
      title: fields.title,
      first_name: fields.firstName,
      last_name: fields.lastName,
      nationality: fields.nationality.toUpperCase(),
      id_type: fields.idType,
      id_number: fields.idNumber,
      id_expiry_date: fields.idExpiryDate,
      date_of_birth: fields.dateOfBirth,
      gender: "unspecified",
      phone: fields.phone,
      email: fields.email,
      whatsapp: null,
      preferred_channel: "phone",
    })
    .select("id")
    .single();
  return { guest, error };
}

function primaryGuestFields(parsed: WalkInCheckInPayload) {
  return {
    title: guestTitleFromPayload(parsed.title),
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    nationality: parsed.nationality,
    idType: parsed.idType,
    idNumber: parsed.idNumber,
    idExpiryDate: resolveGuestIdExpiry(parsed.idType, parsed.idExpiryDate),
    dateOfBirth: parsed.dateOfBirth,
    phone: parsed.phone,
    email: parsed.email,
  };
}

function accompanyingAdultFields(g: AccompanyingAdultGuest, contact: GuestInsertContact) {
  return {
    title: guestTitleFromPayload(g.title ?? null),
    firstName: g.firstName.trim(),
    lastName: g.lastName.trim(),
    nationality: g.nationality,
    idType: g.idType,
    idNumber: g.idNumber.trim(),
    idExpiryDate: resolveGuestIdExpiry(g.idType, g.idExpiryDate),
    dateOfBirth: g.dateOfBirth,
    phone: g.phone?.trim() || contact.phone,
    email: g.email?.trim() || contact.email,
  };
}

function minorGuestFields(g: MinorGuest, contact: GuestInsertContact, kind: "child" | "infant") {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return {
    title: null,
    firstName: g.firstName.trim(),
    lastName: g.lastName.trim(),
    nationality: (g.nationality ?? "NG").toUpperCase(),
    idType: "national_id" as const,
    idNumber: `${kind.toUpperCase()}-${suffix}`,
    idExpiryDate: NATIONAL_ID_ID_EXPIRY_PLACEHOLDER,
    dateOfBirth: g.dateOfBirth,
    phone: contact.phone,
    email: contact.email,
  };
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = walkInCheckInPayloadSchema.parse(await req.json());
    const tenant = await getHotelTenantBySlug(parsed.slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const allowed = await assertTenantMember(tenant.id, user.id);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const attendedByMember = await assertTenantMember(tenant.id, parsed.checkedInByUserId);
    if (!attendedByMember) {
      return NextResponse.json(
        { error: "Selected staff member is not part of this hotel." },
        { status: 400 },
      );
    }

    const roomTypes = normalizeRoomTypes(tenant.room_types);
    const pricing = normalizePricingSetup(tenant.pricing_setup);
    const service = createServerSupabaseClient();

    let roomUnitId: string | null = null;
    let roomTypeCode = parsed.roomTypeCode;

    if (parsed.roomCode?.trim()) {
      const { data: unit, error: unitError } = await service
        .schema("hotel")
        .from("room_units")
        .select("id,room_type_code,status")
        .eq("tenant_id", tenant.id)
        .eq("room_code", parsed.roomCode.trim())
        .maybeSingle();

      if (unitError || !unit) {
        return NextResponse.json({ error: "Room not found." }, { status: 400 });
      }
      if (unit.status === "out_of_order" || unit.status === "maintenance") {
        return NextResponse.json({ error: "Room is not available for check-in." }, { status: 400 });
      }

      const { data: blocking } = await service
        .schema("hotel")
        .from("reservations")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("room_unit_id", unit.id)
        .eq("status", "checked_in")
        .maybeSingle();

      if (blocking) {
        return NextResponse.json({ error: "Room is already occupied." }, { status: 400 });
      }

      if (unit.room_type_code !== parsed.roomTypeCode) {
        const inv = roomTypes.find((t) => t.id === unit.room_type_code);
        const sel = roomTypes.find((t) => t.id === parsed.roomTypeCode);
        return NextResponse.json(
          {
            error: `Assigned room "${parsed.roomCode.trim()}" is "${inv?.name ?? unit.room_type_code}" (max ${
              inv?.maxOccupancy ?? "?"
            } guests). Selected room type is "${sel?.name ?? parsed.roomTypeCode}" (max ${
              sel?.maxOccupancy ?? "?"
            } guests). Choose a room that matches the selected type, change the room type to match this key, or leave assign room blank to assign later.`,
          },
          { status: 400 },
        );
      }

      roomUnitId = unit.id;
      roomTypeCode = unit.room_type_code;
    }

    const roomType = roomTypes.find((t) => t.id === roomTypeCode);
    if (!roomType) {
      return NextResponse.json(
        {
          error:
            "This room's type is not configured in hotel settings. Match room inventory types to pricing setup.",
        },
        { status: 400 },
      );
    }

    const occ = assertWithinRoomTypeOccupancy(
      roomType,
      parsed.adults,
      parsed.children ?? 0,
      parsed.infants ?? 0,
    );
    if (!occ.ok) {
      return NextResponse.json({ error: occ.message }, { status: 400 });
    }

    const arrivalAt = toUtcIso(parsed.arrivalDate, parsed.arrivalTime);
    const departureAt = toUtcIso(parsed.departureDate, parsed.departureTime);
    if (new Date(departureAt).getTime() <= new Date(arrivalAt).getTime()) {
      return NextResponse.json({ error: "Departure must be after arrival." }, { status: 400 });
    }

    const nights = calendarNightsBetween(parsed.arrivalDate, parsed.departureDate);
    const expectedBar = nightlyBarBeforeDiscount(
      roomType,
      pricing,
      parsed.adults,
      parsed.children ?? 0,
      parsed.infants ?? 0,
    );
    if (Math.abs(expectedBar - parsed.ratePerNightBar) > 0.05) {
      return NextResponse.json(
        { error: "Room rate is out of sync with server pricing. Refresh the page and try again." },
        { status: 400 },
      );
    }

    const pricingModel = computeWalkInRoomPricing({
      roomType,
      pricing,
      adults: parsed.adults,
      children: parsed.children ?? 0,
      infants: parsed.infants ?? 0,
      nights,
      discountPercent: parsed.discountPercent,
      discountScope: parsed.discountScope,
      taxExemptions: {
        exemptVat: parsed.taxExemptVat,
        exemptServiceCharge: parsed.taxExemptServiceCharge,
        exemptStateLevy: parsed.taxExemptStateLevy,
        exemptStampLevy: parsed.taxExemptStampLevy,
      },
    });

    const nowIso = new Date().toISOString();
    const primaryContact: GuestInsertContact = { phone: parsed.phone, email: parsed.email };

    const { guest, error: guestError } = await insertGuestProfile(
      service,
      tenant.id,
      primaryGuestFields(parsed),
    );

    if (guestError || !guest) {
      console.error("[check-in] guest insert:", guestError);
      return NextResponse.json({ error: "Could not create guest profile." }, { status: 500 });
    }

    const confirmationCode = uniqueCode("XYV");
    const folioNumber = uniqueCode("XYV-F");
    const registrationNumber = uniqueCode("XYV-R");

    const remarksByPhase = {
      reservation: parsed.guestRemarksReservation?.trim() || "",
      check_in: parsed.guestRemarksCheckIn?.trim() || "",
      check_out: parsed.guestRemarksCheckOut?.trim() || "",
    };

    const blanketTaxExempt =
      parsed.taxExemptVat &&
      parsed.taxExemptServiceCharge &&
      parsed.taxExemptStateLevy &&
      parsed.taxExemptStampLevy;

    const pricingSnapshot = {
      currency: pricing.currency,
      modelVersion: 1,
      nights,
      nightlyBar: expectedBar,
      discountPercent: parsed.discountPercent,
      discountScope: parsed.discountScope,
      nightlyAmounts: pricingModel.nightlyAmounts,
      roomSubtotalBeforeDiscount: pricingModel.roomSubtotalBeforeDiscount,
      roomDiscountAmount: pricingModel.roomDiscountAmount,
      roomSubtotalAfterDiscount: pricingModel.roomSubtotalAfterDiscount,
      taxes: pricingModel.taxes,
      taxExemptions: {
        vat: parsed.taxExemptVat,
        serviceCharge: parsed.taxExemptServiceCharge,
        stateLevy: parsed.taxExemptStateLevy,
        stampLevy: parsed.taxExemptStampLevy,
      },
      settlement: {
        method: parsed.settlementMethod,
        settlementType: parsed.settlementType ?? null,
        cardLast4:
          parsed.settlementMethod === "pos" ? null : (parsed.cardLast4 ?? null),
        cardExpiry:
          parsed.settlementMethod === "pos" ? null : (parsed.cardExpiry ?? null),
        billToAccount: parsed.billToAccount ?? null,
        poNumber: parsed.poNumber ?? null,
        preauthAmount: parsed.preauthAmount ?? null,
      },
      computedAt: nowIso,
    };

    const { data: reservation, error: resError } = await service
      .schema("hotel")
      .from("reservations")
      .insert({
        tenant_id: tenant.id,
        confirmation_code: confirmationCode,
        status: "checked_in",
        arrival_at: arrivalAt,
        departure_at: departureAt,
        nights,
        adults: parsed.adults,
        children_json: buildChildrenJson(parsed.children ?? 0, parsed.infants ?? 0),
        purpose_of_visit: parsed.purposeOfVisit,
        room_type_code: roomTypeCode,
        room_unit_id: roomUnitId,
        rate_type: parsed.rateType,
        season_code: parsed.seasonCode?.trim() || null,
        rate_per_night: expectedBar,
        total_room_charges: pricingModel.roomSubtotalAfterDiscount,
        rate_overridden: parsed.rateOverridden,
        rate_override_reason: parsed.rateOverrideReason?.trim() || null,
        show_rate_on_registration_card: parsed.showRateOnRegistrationCard,
        vat_applicable: !parsed.taxExemptVat,
        tax_exempt: blanketTaxExempt,
        tax_exemption_reason: parsed.taxExemptionReason?.trim() || null,
        tax_exemption_doc_ref: parsed.taxExemptionDocRef?.trim() || null,
        settlement_method: parsed.settlementMethod,
        preauth_amount: parsed.preauthAmount ?? null,
        bill_to_account: parsed.billToAccount?.trim() || null,
        po_number: parsed.poNumber?.trim() || null,
        min_payment_per_day: parsed.minPaymentPerDayToExtend ?? null,
        booking_channel: parsed.bookingChannel?.trim() || null,
        market_segment: parsed.marketSegment,
        source: parsed.source,
        travel_agent_name: parsed.travelAgentName?.trim() || null,
        commission_plan: parsed.commissionPlan?.trim() || null,
        commission_value: parsed.commissionValue ?? null,
        guest_remarks: parsed.guestRemarksCheckIn?.trim() || null,
        voucher_number: parsed.voucherNumber?.trim() || null,
        vip_flag: parsed.vipFlag ?? false,
        folio_number: folioNumber,
        registration_number: registrationNumber,
        checked_in_at: nowIso,
        checked_in_by_staff_id: parsed.checkedInByUserId,
        generate_bill: parsed.generateBill,
        immigration_registration_required: parsed.immigrationRegistrationRequired,
        pricing_snapshot: pricingSnapshot,
        remarks_by_phase: remarksByPhase,
        guarantee_release_date: parsed.guaranteeReleaseDate ?? null,
      })
      .select("id,confirmation_code")
      .single();

    if (resError || !reservation) {
      console.error("[check-in] reservation insert:", resError);
      return NextResponse.json({ error: "Could not create reservation." }, { status: 500 });
    }

    const { error: linkError } = await service.schema("hotel").from("reservation_guests").insert({
      reservation_id: reservation.id,
      guest_id: guest.id,
      is_primary: true,
      relationship: "primary",
    });

    if (linkError) {
      console.error("[check-in] reservation_guests:", linkError);
      return NextResponse.json({ error: "Could not link guest to stay." }, { status: 500 });
    }

    const extraLinks: { reservation_id: string; guest_id: string; is_primary: boolean; relationship: string }[] = [];

    for (const adult of parsed.additionalAdults ?? []) {
      const { guest: extraGuest, error: extraErr } = await insertGuestProfile(
        service,
        tenant.id,
        accompanyingAdultFields(adult, primaryContact),
      );
      if (extraErr || !extraGuest) {
        console.error("[check-in] additional adult guest:", extraErr);
        return NextResponse.json({ error: "Could not create accompanying guest profile." }, { status: 500 });
      }
      extraLinks.push({
        reservation_id: reservation.id,
        guest_id: extraGuest.id,
        is_primary: false,
        relationship: "adult",
      });
    }

    for (const child of parsed.childGuests ?? []) {
      const { guest: childGuest, error: childErr } = await insertGuestProfile(
        service,
        tenant.id,
        minorGuestFields(child, primaryContact, "child"),
      );
      if (childErr || !childGuest) {
        console.error("[check-in] child guest:", childErr);
        return NextResponse.json({ error: "Could not create child guest profile." }, { status: 500 });
      }
      extraLinks.push({
        reservation_id: reservation.id,
        guest_id: childGuest.id,
        is_primary: false,
        relationship: "child",
      });
    }

    for (const infant of parsed.infantGuests ?? []) {
      const { guest: infantGuest, error: infantErr } = await insertGuestProfile(
        service,
        tenant.id,
        minorGuestFields(infant, primaryContact, "infant"),
      );
      if (infantErr || !infantGuest) {
        console.error("[check-in] infant guest:", infantErr);
        return NextResponse.json({ error: "Could not create infant guest profile." }, { status: 500 });
      }
      extraLinks.push({
        reservation_id: reservation.id,
        guest_id: infantGuest.id,
        is_primary: false,
        relationship: "infant",
      });
    }

    if (extraLinks.length > 0) {
      const { error: bulkLinkErr } = await service.schema("hotel").from("reservation_guests").insert(extraLinks);
      if (bulkLinkErr) {
        console.error("[check-in] reservation_guests bulk:", bulkLinkErr);
        return NextResponse.json({ error: "Could not link all guests to stay." }, { status: 500 });
      }
    }

    if (roomUnitId) {
      await service
        .schema("hotel")
        .from("room_units")
        .update({ status: "occupied" })
        .eq("id", roomUnitId)
        .eq("tenant_id", tenant.id);

      await writeAuditLog({
        tenantId: tenant.id,
        actorUserId: user.id,
        action: "check_in",
        entityType: "room_unit",
        entityId: roomUnitId,
        after: { room_code: parsed.roomCode, status: "occupied" },
      });
    }

    await writeAuditLog({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "check_in",
      entityType: "reservation",
      entityId: reservation.id,
      after: { confirmation_code: reservation.confirmation_code },
    });

    await postWalkInFolioBundle(service, {
      tenantId: tenant.id,
      reservationId: reservation.id,
      nights,
      postedBy: user.id,
      currencyCode: pricing.currency,
      pricing: pricingModel,
      discountPercent: parsed.discountPercent,
      discountScope: parsed.discountScope,
    });

    const guestName = `${parsed.firstName} ${parsed.lastName}`;
    await notifyWalkInCheckIn({
      tenantId: tenant.id,
      guestName,
      confirmationCode,
      entityId: reservation.id,
    });

    if (parsed.vipFlag) {
      await notifyVipArrival({
        tenantId: tenant.id,
        guestName,
        roomCode: parsed.roomCode?.trim() ?? null,
        entityId: reservation.id,
      });
    }

    return NextResponse.json({
      ok: true,
      confirmationCode: reservation.confirmation_code,
      reservationId: reservation.id,
      folioNumber,
      registrationNumber,
      grandTotal: pricingModel.taxes.grandTotal,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[check-in]", error);
    return NextResponse.json({ error: "Check-in failed." }, { status: 500 });
  }
}
