import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { snapshotDeposit, listDepositPolicies, depositFor, policyFor } from "@/lib/hms/folio-deposits";
import { setStayAgent } from "@/lib/hms/folio-commission";
import { findExistingGuest } from "@/lib/hms/guest-match";
import { notifyReservationCreated } from "@/lib/hms/notification-rules";
import { snapshotCancellationPolicy, listCancellationPolicies, cancellationPolicyFor, describePolicy } from "@/lib/hms/reservation-cancellation";
import { ANYTIME_CHECK_IN, type HotelPricingSetup, type HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { assertWithinRoomTypeOccupancy } from "@/lib/hms/walk-in-pricing";
import { rateBookFor } from "@/lib/hms/rates/book";
import { priceStay, stayTotals, type StayTotals } from "@/lib/hms/rates/pricing";
import type { RateIssue } from "@/lib/hms/rates/types";
import { findFreeRooms, friendlyReservationError, nightsBetweenDays } from "@/lib/hms/reservation-availability";
import { setGuestTag } from "@/lib/hms/guest-management";

/*
 * Making a booking for a stay in the future. The guest and their stay are saved; the room is not
 * marked as taken and nothing is put on the bill until they check in (deposits are separate).
 * The database refuses a room that is already booked and a room type that is sold out.
 */

export * from "@/lib/hms/reservation-create-shared";
import type { BookingSource, MarketSegment } from "@/lib/hms/reservation-create-shared";

function uniqueCode(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}${rand}`;
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

export function defaultArrivalTime(pricing: HotelPricingSetup) {
  return pricing.checkInTime && pricing.checkInTime !== ANYTIME_CHECK_IN ? pricing.checkInTime : "14:00";
}

export type StayQuote = {
  nights: number;
  nightlyRate: number;
  roomTotal: number;
  grandTotal: number;
  taxTotal: number;
  depositRequired: number;
  depositDueDate: string | null;
  cancellationLines: string[];
  pricing: StayTotals;
  /** The rate plan the quote is on, and anything that stops it being booked. */
  plan: { id: string; code: string; name: string; boardBasis: string; refundable: boolean };
  issues: RateIssue[];
  nightly: { date: string; total: number; label: string | null }[];
};

/** What a stay of this room type costs, the deposit it would ask for and the cancellation terms. */
export async function quoteStay(
  db: SupabaseClient,
  params: {
    tenantId: string;
    roomType: HotelRoomTypeSetup;
    pricing: HotelPricingSetup;
    arrivalDay: string;
    departureDay: string;
    adults: number;
    children: number;
    today: string;
    /** Rate plan code or id; leave out for the hotel's default plan. */
    ratePlan?: string | null;
    arCustomerId?: string | null;
  },
): Promise<StayQuote> {
  const book = await rateBookFor(db, params.tenantId, [params.roomType], params.pricing, { since: params.arrivalDay });
  const priced = priceStay(book, {
    roomTypeCode: params.roomType.id,
    plan: params.ratePlan,
    arrivalDay: params.arrivalDay,
    departureDay: params.departureDay,
    adults: params.adults,
    children: params.children,
    bookedOn: params.today,
    arCustomerId: params.arCustomerId,
  });
  if (!priced.ok) throw new Error(priced.error);
  const nights = priced.nights.length;
  const totals = stayTotals({ nightly: priced.nightlyAmounts, serviceChargeRate: params.pricing.serviceChargeRate, taxRate: params.pricing.taxRate });
  const [depositPolicies, cancelPolicies] = await Promise.all([listDepositPolicies(db, params.tenantId), listCancellationPolicies(db, params.tenantId)]);
  const dep = depositFor(policyFor(depositPolicies, params.roomType.id), {
    stayTotal: totals.taxes.grandTotal,
    nights,
    arrivalDate: params.arrivalDay,
    bookedOn: params.today,
  });
  return {
    nights,
    nightlyRate: priced.averageRate,
    roomTotal: totals.roomSubtotalAfterDiscount,
    grandTotal: totals.taxes.grandTotal,
    taxTotal: money(totals.taxes.grandTotal - totals.roomSubtotalAfterDiscount),
    depositRequired: dep.required,
    depositDueDate: dep.dueDate,
    cancellationLines: describePolicy(cancellationPolicyFor(cancelPolicies, params.roomType.id), params.pricing.currency),
    pricing: totals,
    plan: { id: priced.plan.id, code: priced.plan.code, name: priced.plan.name, boardBasis: priced.plan.boardBasis, refundable: priced.plan.refundable },
    issues: priced.issues,
    nightly: priced.nights.map((n) => ({ date: n.date, total: n.total, label: n.label })),
  };
}

export type NewGuest = { title?: string | null; firstName: string; lastName: string; phone: string; email: string };

export type CreateReservationInput = {
  tenantId: string;
  userId: string;
  roomTypes: HotelRoomTypeSetup[];
  pricing: HotelPricingSetup;
  today: string;
  arrivalDay: string;
  departureDay: string;
  roomTypeCode: string;
  roomUnitId?: string | null;
  /** A room the guest asked for. A wish, not a hold: it never blocks the booking. */
  requestedRoomUnitId?: string | null;
  adults: number;
  children: number;
  guestId?: string | null;
  newGuest?: NewGuest | null;
  source: BookingSource;
  marketSegment?: MarketSegment;
  purpose?: "leisure" | "business" | "transit";
  bookingChannel?: string | null;
  notes?: string | null;
  vip?: boolean;
  travelAgentId?: string | null;
  allotmentId?: string | null;
  groupBookingId?: string | null;
  overrideLimit?: { reason: string } | null;
  /** Rate plan code or id; leave out for the hotel's default plan. */
  ratePlan?: string | null;
  /** The company the booking is for, for company rate plans. */
  arCustomerId?: string | null;
  /** A manager has agreed to sell a stay that breaks a rate restriction (minimum stay, closed to arrival…). */
  overrideRestrictions?: { reason: string } | null;
};

export type CreateReservationResult =
  | { ok: true; reservationId: string; confirmationCode: string; guestId: string; matchedExistingGuest: boolean; grandTotal: number }
  | { ok: false; error: string; code?: "room_taken" | "type_full" | "restricted" };

export async function createReservation(db: SupabaseClient, input: CreateReservationInput): Promise<CreateReservationResult> {
  const roomType = input.roomTypes.find((t) => t.id === input.roomTypeCode);
  if (!roomType) return { ok: false, error: "That room type isn't set up in your hotel settings." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.arrivalDay) || !/^\d{4}-\d{2}-\d{2}$/.test(input.departureDay)) return { ok: false, error: "Choose both dates." };
  if (input.departureDay <= input.arrivalDay) return { ok: false, error: "The guest must stay at least one night." };
  if (input.arrivalDay < input.today) return { ok: false, error: "The arrival date can't be in the past." };
  const nights = nightsBetweenDays(input.arrivalDay, input.departureDay);
  if (nights > 365) return { ok: false, error: "A booking can be at most 365 nights." };

  const occupancy = assertWithinRoomTypeOccupancy(roomType, input.adults, input.children, 0);
  if (!occupancy.ok) return { ok: false, error: occupancy.message };

  let roomUnitId: string | null = null;
  let roomTypeCode = input.roomTypeCode;
  if (input.roomUnitId) {
    const { data: unit } = await db.schema("hotel").from("room_units").select("id,room_code,room_type_code,status").eq("tenant_id", input.tenantId).eq("id", input.roomUnitId).maybeSingle();
    if (!unit) return { ok: false, error: "That room wasn't found." };
    if (unit.status === "out_of_order") return { ok: false, error: `Room ${unit.room_code} is out of order.` };
    if (unit.room_type_code !== input.roomTypeCode) return { ok: false, error: `Room ${unit.room_code} is not a ${roomType.name}.` };
    const free = await findFreeRooms(db, { tenantId: input.tenantId, fromDay: input.arrivalDay, toDay: input.departureDay, roomTypeCode: input.roomTypeCode });
    if (!free.some((u) => u.id === unit.id)) {
      return { ok: false, code: "room_taken", error: `Room ${unit.room_code} isn't free for those nights: another booking or a block holds it.` };
    }
    roomUnitId = unit.id as string;
    roomTypeCode = unit.room_type_code as string;
  }

  let requestedRoomUnitId: string | null = null;
  if (input.requestedRoomUnitId) {
    const { data: reqUnit } = await db.schema("hotel").from("room_units").select("id").eq("tenant_id", input.tenantId).eq("id", input.requestedRoomUnitId).maybeSingle();
    requestedRoomUnitId = (reqUnit?.id as string | undefined) ?? null;
  }

  // The guest: someone already on file, or a new person (matched to a profile we already have when we can).
  let guestId = input.guestId ?? null;
  let matchedExistingGuest = Boolean(guestId);
  let guestName = "";
  if (guestId) {
    const { data: g } = await db.schema("hotel").from("guests").select("id,first_name,last_name,anonymised_at").eq("tenant_id", input.tenantId).eq("id", guestId).maybeSingle();
    if (!g) return { ok: false, error: "That guest wasn't found." };
    if (g.anonymised_at) return { ok: false, error: "That guest's details were erased, so they can't be booked." };
    guestName = `${g.first_name} ${g.last_name}`.trim();
  } else if (input.newGuest) {
    const ng = input.newGuest;
    if (!ng.firstName.trim() || !ng.lastName.trim()) return { ok: false, error: "Enter the guest's first and last name." };
    if (!ng.phone.trim() && !ng.email.trim()) return { ok: false, error: "Enter a phone number or an email address so the guest can be reached." };
    const match = await findExistingGuest(db, input.tenantId, {
      idType: "national_id",
      idNumber: "",
      firstName: ng.firstName,
      lastName: ng.lastName,
      email: ng.email,
      phone: ng.phone,
    }).catch(() => null);
    if (match) {
      guestId = match.id;
      matchedExistingGuest = true;
    } else {
      // ID details are collected at check-in; until then the profile carries a placeholder the check-in form overwrites.
      const { data: created, error: guestError } = await db
        .schema("hotel")
        .from("guests")
        .insert({
          tenant_id: input.tenantId,
          title: ng.title?.trim() || null,
          first_name: ng.firstName.trim(),
          last_name: ng.lastName.trim(),
          nationality: "NG",
          id_type: "national_id",
          id_number: `PENDING-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          id_expiry_date: "9999-12-31",
          date_of_birth: "1900-01-01",
          gender: "unspecified",
          phone: ng.phone.trim(),
          email: ng.email.trim(),
          preferred_channel: ng.email.trim() ? "email" : "phone",
        })
        .select("id")
        .single();
      if (guestError || !created) return { ok: false, error: "The guest couldn't be saved." };
      guestId = created.id as string;
    }
    guestName = `${ng.firstName} ${ng.lastName}`.trim();
  } else {
    return { ok: false, error: "Choose a guest or enter the guest's name." };
  }

  const book = await rateBookFor(db, input.tenantId, input.roomTypes, input.pricing, { since: input.arrivalDay });
  const rated = priceStay(book, {
    roomTypeCode: roomType.id,
    plan: input.ratePlan,
    arrivalDay: input.arrivalDay,
    departureDay: input.departureDay,
    adults: input.adults,
    children: input.children,
    bookedOn: input.today,
    arCustomerId: input.arCustomerId,
  });
  if (!rated.ok) return { ok: false, error: rated.error };
  if (!rated.bookable && !input.overrideRestrictions) {
    return { ok: false, error: rated.issues.map((i) => i.message).join(" "), code: "restricted" };
  }
  const priced = stayTotals({ nightly: rated.nightlyAmounts, serviceChargeRate: input.pricing.serviceChargeRate, taxRate: input.pricing.taxRate });
  const bar = rated.averageRate;
  const realPlan = rated.plan.id !== "implicit";
  const snapshot = {
    currency: input.pricing.currency,
    modelVersion: 1,
    nights,
    nightlyBar: bar,
    discountPercent: 0,
    discountScope: "none",
    nightlyAmounts: priced.nightlyAmounts,
    roomSubtotalBeforeDiscount: priced.roomSubtotalBeforeDiscount,
    roomDiscountAmount: priced.roomDiscountAmount,
    roomSubtotalAfterDiscount: priced.roomSubtotalAfterDiscount,
    taxes: priced.taxes,
    taxExemptions: { vat: false, serviceCharge: false, stateLevy: false, stampLevy: false },
    settlement: { method: "cash", settlementType: null },
    bookedFrom: "reservations",
    ratePlanCode: rated.plan.code,
    ratePlanName: rated.plan.name,
    nightlySource: rated.nights.map((n) => ({ date: n.date, base: n.base, source: n.source, label: n.label })),
    ...(input.overrideRestrictions ? { restrictionOverride: input.overrideRestrictions.reason } : {}),
    computedAt: new Date().toISOString(),
  };

  const arrivalTime = defaultArrivalTime(input.pricing);
  const confirmationCode = uniqueCode("XYV");
  const { data: inserted, error } = await db
    .schema("hotel")
    .from("reservations")
    .insert({
      tenant_id: input.tenantId,
      confirmation_code: confirmationCode,
      folio_number: uniqueCode("XYV-F"),
      registration_number: uniqueCode("XYV-R"),
      status: "confirmed",
      arrival_at: `${input.arrivalDay}T${arrivalTime}:00.000Z`,
      departure_at: `${input.departureDay}T${input.pricing.checkOutTime || "12:00"}:00.000Z`,
      nights,
      adults: input.adults,
      children_json: Array.from({ length: input.children }, () => ({ type: "child" })),
      purpose_of_visit: input.purpose ?? "leisure",
      room_type_code: roomTypeCode,
      room_unit_id: roomUnitId,
      requested_room_unit_id: requestedRoomUnitId,
      rate_type: rated.plan.arCustomerId ? "corporate" : "rack",
      rate_per_night: bar,
      total_room_charges: priced.roomSubtotalAfterDiscount,
      vat_applicable: true,
      tax_exempt: false,
      settlement_method: "cash",
      booking_channel: input.bookingChannel?.trim() || "Reservations desk",
      market_segment: input.marketSegment ?? "transient",
      source: input.source,
      guest_remarks: input.notes?.trim() || null,
      vip_flag: Boolean(input.vip),
      pricing_snapshot: snapshot,
      ...(realPlan ? { rate_plan_id: rated.plan.id, rate_plan_code: rated.plan.code } : {}),
      remarks_by_phase: { reservation: input.notes?.trim() || "", check_in: "", check_out: "" },
      allotment_id: input.allotmentId ?? null,
      group_booking_id: input.groupBookingId ?? null,
      ...(input.overrideLimit
        ? { overbooking_override: true, overbooking_override_by: input.userId, overbooking_override_reason: input.overrideLimit.reason }
        : {}),
    })
    .select("id,confirmation_code")
    .single();

  if (error || !inserted) {
    const friendly = friendlyReservationError(error?.message);
    if (friendly) return { ok: false, error: friendly.text, code: friendly.kind };
    console.error("[createReservation]", error?.message ?? error, error?.details ?? "");
    return { ok: false, error: "The booking couldn't be saved." };
  }

  const reservationId = inserted.id as string;
  const { error: linkError } = await db.schema("hotel").from("reservation_guests").insert({ reservation_id: reservationId, guest_id: guestId, is_primary: true, relationship: "primary" });
  if (linkError) {
    await db.schema("hotel").from("reservations").delete().eq("id", reservationId);
    return { ok: false, error: "The guest couldn't be linked to the booking." };
  }

  // A VIP guest stays VIP on every later stay.
  if (input.vip) await setGuestTag(db, { tenantId: input.tenantId, guestId, tag: "vip", enabled: true, actorUserId: input.userId }).catch(() => undefined);

  await snapshotDeposit(db, input.tenantId, reservationId).catch(() => undefined);
  await snapshotCancellationPolicy(db, input.tenantId, reservationId, roomTypeCode).catch(() => undefined);
  if (input.travelAgentId) {
    const agent = await setStayAgent(db, { tenantId: input.tenantId, reservationId, agentId: input.travelAgentId });
    if (!agent.ok) console.warn("[createReservation] travel agent not set", agent.error);
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.userId,
    action: "reservation_created",
    entityType: "reservation",
    entityId: reservationId,
    after: {
      confirmation_code: inserted.confirmation_code,
      arrival: input.arrivalDay,
      departure: input.departureDay,
      room_type: roomTypeCode,
      room_unit_id: roomUnitId,
      source: input.source,
      rate_plan: rated.plan.code,
      ...(input.overrideRestrictions ? { restriction_override: input.overrideRestrictions.reason } : {}),
      ...(input.overrideLimit ? { overbooking_override: input.overrideLimit.reason } : {}),
    },
  });
  await notifyReservationCreated({
    tenantId: input.tenantId,
    guestName,
    confirmationCode: inserted.confirmation_code as string,
    arrivalDate: input.arrivalDay,
    entityId: reservationId,
  }).catch(() => undefined);

  return { ok: true, reservationId, confirmationCode: inserted.confirmation_code as string, guestId: guestId!, matchedExistingGuest, grandTotal: priced.taxes.grandTotal };
}
