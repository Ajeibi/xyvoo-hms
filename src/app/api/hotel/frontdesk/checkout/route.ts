import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { getFolioForReservation, getTenantFolioSettings, adjustFolioForEarlyCheckout } from "@/lib/hms/folio";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import {
  postExtraNightCharges,
  summariseExtraNights,
  type ExtraNightReservation,
} from "@/lib/hms/folio-extra-nights";
import { notifyCheckoutCompleted, notifyCommissionDue, notifyOverdueCheckout } from "@/lib/hms/notification-rules";
import { openOrEscalateHousekeepingTask } from "@/lib/hms/housekeeping-tasks";
import { setRoomStatus } from "@/lib/hms/room-status";
import { executeKeyRevoke } from "@/lib/hms/integrations/smart-lock";
import { assignInvoiceNumber, sendInvoiceEmail } from "@/lib/hms/folio-invoice";
import { billWindowsToAccounts, loadWindows, planWindowBilling, summariseWindows } from "@/lib/hms/folio-windows";

const CheckoutSchema = z
  .object({
    slug: z.string().min(1),
    reservationId: z.string().uuid().optional(),
    roomCode: z.string().min(1).max(20).optional(),
    notes: z.string().max(500).optional(),
    overrideBalance: z.boolean().optional(),
  })
  .refine((d) => d.reservationId || d.roomCode, {
    message: "reservationId or roomCode required",
  });

export async function POST(req: Request) {
  try {
    const body = CheckoutSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let query = auth.service
      .schema("hotel")
      .from("reservations")
      .select(
        "id,confirmation_code,arrival_at,departure_at,nights,checked_in_at,rate_per_night,total_room_charges,room_unit_id,status,tenant_id,commission_plan,commission_value,folio_number,vat_applicable,tax_exempt,pricing_snapshot,extra_nights_confirmed_on",
      )
      .eq("tenant_id", auth.tenant.id)
      .eq("status", "checked_in");

    if (body.reservationId) {
      query = query.eq("id", body.reservationId);
    } else if (body.roomCode) {
      const { data: unit } = await auth.service
        .schema("hotel")
        .from("room_units")
        .select("id")
        .eq("tenant_id", auth.tenant.id)
        .eq("room_code", body.roomCode.trim())
        .maybeSingle();
      if (!unit) return NextResponse.json({ error: "Room not found." }, { status: 404 });
      query = query.eq("room_unit_id", unit.id);
    }

    const { data: reservation, error: findError } = await query.maybeSingle();
    if (findError || !reservation) {
      return NextResponse.json({ error: "No active stay found to check out." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const checkoutAt = new Date(nowIso);
    const pricing = normalizePricingSetup(auth.tenant.pricing_setup);
    const currency = pricing.currency;

    const extraNights = await postExtraNightCharges(auth.service, {
      tenantId: auth.tenant.id,
      reservation: reservation as ExtraNightReservation,
      pricing,
      postedBy: auth.user.id,
      now: checkoutAt,
    });
    if (extraNights.postedNights.length > 0) {
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "folio_extra_nights_charged",
        entityType: "reservation",
        entityId: reservation.id,
        after: { nights: extraNights.postedNights, amount: extraNights.postedAmount },
      });
    }

    let earlyCheckoutCredit = 0;
    let actualStayNights: number | null = null;
    if (reservation.checked_in_at) {
      const adjustment = await adjustFolioForEarlyCheckout(auth.service, {
        tenantId: auth.tenant.id,
        reservationId: reservation.id,
        bookedNights: reservation.nights,
        checkedInAt: reservation.checked_in_at,
        checkoutAt,
        postedBy: auth.user.id,
        currencyCode: currency,
      });
      actualStayNights = adjustment.actualNights;
      if (adjustment.adjusted) {
        earlyCheckoutCredit = adjustment.creditAmount;
        await writeAuditLog({
          tenantId: auth.tenant.id,
          actorUserId: auth.user.id,
          action: "folio_early_checkout_adjustment",
          entityType: "reservation",
          entityId: reservation.id,
          after: {
            bookedNights: reservation.nights,
            actualNights: adjustment.actualNights,
            unusedNights: adjustment.unusedNights,
            creditAmount: adjustment.creditAmount,
          },
        });
      }
    }

    const folio = await getFolioForReservation(auth.service, auth.tenant.id, reservation.id);
    const settings = await getTenantFolioSettings(auth.service, auth.tenant.id);

    // Windows linked to a company account are billed to it; the guest settles the rest.
    const { payers } = await loadWindows(auth.service, auth.tenant.id, reservation.id);
    const windows = summariseWindows(folio.lines, payers, "Guest");
    const { dueNow } = planWindowBilling(windows);
    if (
      dueNow > 0.01 &&
      !settings.allowCheckoutWithBalance &&
      !body.overrideBalance &&
      !isAdminLikeRole(auth.role)
    ) {
      return NextResponse.json(
        { error: "Outstanding folio balance must be settled before checkout.", balance: dueNow },
        { status: 409 },
      );
    }

    let unitCode: string | null = null;
    if (reservation.room_unit_id) {
      const { data: unit } = await auth.service.schema("hotel").from("room_units").select("room_code").eq("id", reservation.room_unit_id).maybeSingle();
      unitCode = (unit?.room_code as string | undefined) ?? null;
    }
    const billing = await billWindowsToAccounts(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: reservation.id,
      confirmationCode: reservation.confirmation_code,
      folioNumber: reservation.folio_number,
      roomCode: unitCode,
      windows,
      currency,
      userId: auth.user.id,
    });
    if (!billing.ok) return NextResponse.json({ error: billing.error }, { status: 409 });
    for (const b of billing.billed) {
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "folio_window_billed_to_account",
        entityType: "reservation",
        entityId: reservation.id,
        after: b,
      });
    }

    const wasOverdue = new Date(reservation.departure_at).getTime() < Date.now();

    const bookedTotal = Number(reservation.total_room_charges) || 0;
    const bookedNights = Math.max(1, reservation.nights);
    const adjustedRoomTotal =
      earlyCheckoutCredit > 0 && actualStayNights != null
        ? Math.round(bookedTotal * (actualStayNights / bookedNights) * 100) / 100
        : bookedTotal;
    const extra = summariseExtraNights(folio.lines);

    const { error: resError } = await auth.service
      .schema("hotel")
      .from("reservations")
      .update({
        status: "checked_out",
        checked_out_at: nowIso,
        departure_at: nowIso,
        ...(earlyCheckoutCredit > 0 && actualStayNights != null
          ? {
              nights: actualStayNights,
              total_room_charges: adjustedRoomTotal,
            }
          : extra.nights > 0
            ? {
                nights: bookedNights + extra.nights,
                total_room_charges: Math.round((bookedTotal + extra.roomTotal) * 100) / 100,
              }
            : {}),
      })
      .eq("id", reservation.id);

    if (resError) {
      return NextResponse.json({ error: "Could not complete checkout." }, { status: 500 });
    }

    let roomCode = body.roomCode?.trim() ?? "—";
    if (reservation.room_unit_id) {
      const { data: unit } = await auth.service
        .schema("hotel")
        .from("room_units")
        .select("room_code")
        .eq("id", reservation.room_unit_id)
        .maybeSingle();
      if (unit) roomCode = unit.room_code;

      await setRoomStatus(auth.service, {
        tenantId: auth.tenant.id,
        roomUnitId: reservation.room_unit_id,
        status: "dirty",
        actorUserId: auth.user.id,
        roomCode,
        extra: { notes: body.notes ?? null },
      });

      await openOrEscalateHousekeepingTask(auth.service, {
        tenantId: auth.tenant.id,
        roomUnitId: reservation.room_unit_id,
        taskType: "checkout_clean",
        reservationId: reservation.id,
      });

      try {
        await executeKeyRevoke({
          supabase: auth.service,
          tenantId: auth.tenant.id,
          tenant: { smart_lock_setup: auth.tenant.smart_lock_setup },
          roomUnitId: reservation.room_unit_id,
          roomCode,
          reservationId: reservation.id,
          staffUserId: auth.user.id,
        });
      } catch (e) {
        console.warn("[checkout] key revoke failed", e);
      }
    }

    const { data: rg } = await auth.service
      .schema("hotel")
      .from("reservation_guests")
      .select("guests(first_name,last_name,email)")
      .eq("reservation_id", reservation.id)
      .eq("is_primary", true)
      .maybeSingle();

    type GuestEmbed =
      | { first_name: string; last_name: string; email: string | null }
      | { first_name: string; last_name: string; email: string | null }[];
    const raw = rg?.guests as GuestEmbed | null;
    const guest = Array.isArray(raw) ? raw[0] : raw;
    const guestName = guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest";

    // Anything the guest overpaid (say, after the early check-out credit) is shown so it can be refunded.
    const finalLines = await getFolioForReservation(auth.service, auth.tenant.id, reservation.id);
    const owedBack = Math.round(Math.max(0, -finalLines.windowBalances.guest) * 100) / 100;

    // The final invoice: numbered now, and emailed to the guest as a PDF (it is also the receipt).
    const invoiceNumber = await assignInvoiceNumber(auth.service, auth.tenant.id, reservation.id);
    let receiptSent = false;
    if (guest?.email) {
      const sent = await sendInvoiceEmail(auth.service, { tenantId: auth.tenant.id, reservationId: reservation.id });
      receiptSent = sent.ok;
      if (!sent.ok) console.warn("[checkout] invoice email failed", sent.error);
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "checkout_completed",
      entityType: "reservation",
      entityId: reservation.id,
      after: { room_code: roomCode, status: "checked_out" },
    });

    await notifyCheckoutCompleted({
      tenantId: auth.tenant.id,
      guestName,
      roomCode,
      wasOverdue,
      entityId: reservation.id,
    });

    if (wasOverdue) {
      await notifyOverdueCheckout({
        tenantId: auth.tenant.id,
        guestName,
        roomCode,
        entityId: reservation.id,
      });
    }

    const commission = Number(reservation.commission_value);
    if (reservation.commission_plan && commission > 0) {
      await notifyCommissionDue({
        tenantId: auth.tenant.id,
        guestName,
        amount: commission,
        entityId: reservation.id,
      });
    }

    return NextResponse.json({
      ok: true,
      confirmationCode: reservation.confirmation_code,
      roomCode,
      earlyCheckoutCredit: earlyCheckoutCredit > 0 ? earlyCheckoutCredit : undefined,
      actualNights: actualStayNights ?? undefined,
      extraNights: extra.nights > 0 ? extra.nights : undefined,
      extraNightsTotal: extra.nights > 0 ? extra.total : undefined,
      // Nights past the automatic limit that staff chose not to confirm, so weren't charged.
      unchargedNights: extraNights.waitingNights.length > 0 ? extraNights.waitingNights.length : undefined,
      receiptSent,
      owedBack: owedBack > 0.009 ? owedBack : undefined,
      billedToAccounts: billing.billed.length ? billing.billed : undefined,
      invoiceNumber: invoiceNumber ?? undefined,
      receiptEmail: receiptSent ? guest?.email : undefined,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
