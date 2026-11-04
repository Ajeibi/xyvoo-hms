import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { computeWalkInRoomPricing, type DiscountScope } from "@/lib/hms/walk-in-pricing";
import type { HotelPricingSetup, HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { findFreeRooms } from "@/lib/hms/reservation-availability";
import {
  addDays,
  dayOf,
  friendlyReservationError,
  formatDayShort,
  nightsBetweenDays,
  timeOf,
} from "@/lib/hms/reservation-availability-shared";

/*
 * Changing a booking that has not arrived yet: move it to other dates, lengthen or shorten it, or
 * put it in another room. Availability is checked here for a clear message, and again by the
 * database (a room can never hold two bookings on the same night; a room type cannot be sold past
 * its limit), which is what actually protects the hotel when two people act at once.
 *
 * A guest who is already in the house keeps using the stay-change and room-assign routes of the
 * front desk (they carry the bill with them); this is for bookings still "confirmed".
 */

export const CHANGE_COLUMNS =
  "id,confirmation_code,status,arrival_at,departure_at,nights,adults,children_json,room_type_code,room_unit_id,rate_per_night,total_room_charges,pricing_snapshot,allotment_id,group_booking_id,vat_applicable,tax_exempt";

export type ChangeableReservation = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  nights: number;
  adults: number;
  children_json: unknown;
  room_type_code: string;
  room_unit_id: string | null;
  rate_per_night: number | string;
  total_room_charges: number | string;
  pricing_snapshot: Record<string, unknown> | null;
  allotment_id: string | null;
  group_booking_id: string | null;
  vat_applicable: boolean | null;
  tax_exempt: boolean | null;
};

export type BookingChange = {
  /** New arrival day (YYYY-MM-DD). */
  arrivalDay?: string;
  /** New departure day (YYYY-MM-DD). */
  departureDay?: string;
  /** A room to put the booking in, or null to take it out of its room. */
  roomUnitId?: string | null;
};

export type ChangePlan = {
  arrivalDay: string;
  departureDay: string;
  nights: number;
  roomUnitId: string | null;
  roomTypeCode: string;
  roomCode: string | null;
  movedType: boolean;
  newRate: number;
  newTotalRoom: number;
  oldTotalRoom: number;
  nightlyAmounts: number[];
  taxes: unknown;
  datesChanged: boolean;
  roomChanged: boolean;
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function discountOf(snapshot: Record<string, unknown> | null): { percent: number; scope: DiscountScope } {
  const percent = Number(snapshot?.discountPercent);
  const scope = snapshot?.discountScope;
  const valid: DiscountScope[] = ["none", "all_nights", "first_night", "last_night", "first_and_last"];
  return {
    percent: Number.isFinite(percent) ? percent : 0,
    scope: typeof scope === "string" && (valid as string[]).includes(scope) ? (scope as DiscountScope) : "none",
  };
}

function exemptionsOf(r: ChangeableReservation) {
  const e = (r.pricing_snapshot?.taxExemptions ?? null) as Record<string, unknown> | null;
  if (e) {
    return { exemptVat: e.vat === true, exemptServiceCharge: e.serviceCharge === true, exemptStateLevy: e.stateLevy === true, exemptStampLevy: e.stampLevy === true };
  }
  return { exemptVat: r.vat_applicable === false, exemptServiceCharge: r.tax_exempt === true, exemptStateLevy: r.tax_exempt === true, exemptStampLevy: r.tax_exempt === true };
}

/** What the booking would look like after the change, and what it costs. Pure apart from the room lookup passed in. */
export function planBookingChange(
  r: ChangeableReservation,
  change: BookingChange,
  ctx: { roomTypes: HotelRoomTypeSetup[]; pricing: HotelPricingSetup; targetRoom: { id: string; roomCode: string; roomTypeCode: string } | null; today: string },
): { ok: true; plan: ChangePlan } | { ok: false; error: string } {
  if (r.status !== "confirmed") {
    return { ok: false, error: "Only a booking that hasn't arrived can be changed here. A guest in the house is changed from the front desk." };
  }
  const oldArrival = dayOf(r.arrival_at);
  const oldDeparture = dayOf(r.departure_at);
  const arrivalDay = change.arrivalDay ?? oldArrival;
  const departureDay = change.departureDay ?? oldDeparture;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDay) || !/^\d{4}-\d{2}-\d{2}$/.test(departureDay)) return { ok: false, error: "Choose both dates." };
  if (departureDay <= arrivalDay) return { ok: false, error: "The guest must stay at least one night." };
  const nights = nightsBetweenDays(arrivalDay, departureDay);
  if (nights > 365) return { ok: false, error: "A booking can be at most 365 nights." };
  if (arrivalDay < ctx.today && arrivalDay !== oldArrival) return { ok: false, error: "A booking can't be moved to arrive in the past." };

  let roomUnitId = r.room_unit_id;
  let roomTypeCode = r.room_type_code;
  let roomCode: string | null = null;
  if (change.roomUnitId !== undefined) {
    if (change.roomUnitId === null) {
      roomUnitId = null;
    } else {
      if (!ctx.targetRoom || ctx.targetRoom.id !== change.roomUnitId) return { ok: false, error: "That room wasn't found." };
      roomUnitId = ctx.targetRoom.id;
      roomCode = ctx.targetRoom.roomCode;
      roomTypeCode = ctx.targetRoom.roomTypeCode;
    }
  }

  const movedType = roomTypeCode !== r.room_type_code;
  const type = ctx.roomTypes.find((t) => t.id === roomTypeCode);
  if (!type) return { ok: false, error: "That room type isn't set up in your hotel settings." };

  // Keep the nightly rate the guest was quoted. Only a move to another room type is priced afresh.
  const oldRate = Number(r.rate_per_night) || 0;
  const discount = discountOf(r.pricing_snapshot);
  const useRate = movedType ? undefined : oldRate;
  const priced = computeWalkInRoomPricing({
    roomType: useRate === undefined ? type : { ...type, baseRate: useRate },
    pricing: useRate === undefined ? ctx.pricing : { ...ctx.pricing, extraAdultRate: 0, extraChildRate: 0 },
    adults: useRate === undefined ? r.adults : 1,
    children: 0,
    infants: 0,
    nights,
    discountPercent: discount.percent,
    discountScope: discount.scope,
    taxExemptions: exemptionsOf(r),
  });

  const datesChanged = arrivalDay !== oldArrival || departureDay !== oldDeparture;
  const roomChanged = roomUnitId !== r.room_unit_id || movedType;
  if (!datesChanged && !roomChanged) return { ok: false, error: "Nothing has changed." };

  return {
    ok: true,
    plan: {
      arrivalDay,
      departureDay,
      nights,
      roomUnitId,
      roomTypeCode,
      roomCode,
      movedType,
      newRate: priced.nightlyBar,
      newTotalRoom: priced.roomSubtotalAfterDiscount,
      oldTotalRoom: money(Number(r.total_room_charges) || 0),
      nightlyAmounts: priced.nightlyAmounts,
      taxes: priced.taxes,
      datesChanged,
      roomChanged,
    },
  };
}

export type ChangeResult =
  | { ok: true; plan: ChangePlan; before: { arrivalDay: string; departureDay: string; roomCode: string | null }; after: { arrivalDay: string; departureDay: string; roomCode: string | null } }
  | { ok: false; error: string; code?: "room_taken" | "type_full" | "not_found" };

async function roomCodeOf(db: SupabaseClient, tenantId: string, id: string | null) {
  if (!id) return null;
  const { data } = await db.schema("hotel").from("room_units").select("room_code").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return (data?.room_code as string | undefined) ?? null;
}

/** Applies a change to a booking that hasn't arrived. `preview` works it out and checks the room without saving. */
export async function changeReservation(
  db: SupabaseClient,
  params: {
    tenantId: string;
    reservationId: string;
    userId: string | null;
    change: BookingChange;
    roomTypes: HotelRoomTypeSetup[];
    pricing: HotelPricingSetup;
    today: string;
    preview?: boolean;
    /** A manager has agreed to sell past the room type's limit. */
    overrideLimit?: { reason: string } | null;
  },
): Promise<ChangeResult> {
  const { data: row } = await db
    .schema("hotel")
    .from("reservations")
    .select(CHANGE_COLUMNS)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservationId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Booking not found.", code: "not_found" };
  const r = row as unknown as ChangeableReservation;

  let targetRoom: { id: string; roomCode: string; roomTypeCode: string } | null = null;
  if (params.change.roomUnitId) {
    const { data: unit } = await db
      .schema("hotel")
      .from("room_units")
      .select("id,room_code,room_type_code,status")
      .eq("tenant_id", params.tenantId)
      .eq("id", params.change.roomUnitId)
      .maybeSingle();
    if (!unit) return { ok: false, error: "That room wasn't found." };
    if (unit.status === "out_of_order") return { ok: false, error: `Room ${unit.room_code} is out of order.` };
    targetRoom = { id: unit.id as string, roomCode: unit.room_code as string, roomTypeCode: unit.room_type_code as string };
  }

  const planned = planBookingChange(r, params.change, { roomTypes: params.roomTypes, pricing: params.pricing, targetRoom, today: params.today });
  if (!planned.ok) return planned;
  const { plan } = planned;

  const beforeRoom = await roomCodeOf(db, params.tenantId, r.room_unit_id);
  const afterRoom = plan.roomUnitId ? (plan.roomCode ?? (await roomCodeOf(db, params.tenantId, plan.roomUnitId))) : null;
  const result: ChangeResult = {
    ok: true,
    plan,
    before: { arrivalDay: dayOf(r.arrival_at), departureDay: dayOf(r.departure_at), roomCode: beforeRoom },
    after: { arrivalDay: plan.arrivalDay, departureDay: plan.departureDay, roomCode: afterRoom },
  };

  // A clear message first: the room must be free for every night (the database checks again when saving).
  if (plan.roomUnitId && (plan.datesChanged || plan.roomUnitId !== r.room_unit_id)) {
    const free = await findFreeRooms(db, {
      tenantId: params.tenantId,
      fromDay: plan.arrivalDay,
      toDay: plan.departureDay,
      roomTypeCode: plan.roomTypeCode,
      excludeReservationId: r.id,
    });
    if (!free.some((u) => u.id === plan.roomUnitId)) {
      const roomLabel = afterRoom ? `Room ${afterRoom}` : "That room";
      return { ok: false, code: "room_taken", error: `${roomLabel} isn't free from ${formatDayShort(plan.arrivalDay)} to ${formatDayShort(plan.departureDay)}: another booking or a block holds it.` };
    }
  }

  if (params.preview) return result;

  const snapshot = {
    ...(r.pricing_snapshot ?? {}),
    nights: plan.nights,
    nightlyBar: plan.newRate,
    nightlyAmounts: plan.nightlyAmounts,
    roomSubtotalAfterDiscount: plan.newTotalRoom,
    taxes: plan.taxes,
    lastChangedAt: new Date().toISOString(),
  };
  const update: Record<string, unknown> = {
    arrival_at: `${plan.arrivalDay}T${timeOf(r.arrival_at)}:00.000Z`,
    departure_at: `${plan.departureDay}T${timeOf(r.departure_at)}:00.000Z`,
    nights: plan.nights,
    room_unit_id: plan.roomUnitId,
    room_type_code: plan.roomTypeCode,
    rate_per_night: plan.newRate,
    total_room_charges: plan.newTotalRoom,
    pricing_snapshot: snapshot,
  };
  if (params.overrideLimit) {
    update.overbooking_override = true;
    update.overbooking_override_by = params.userId;
    update.overbooking_override_reason = params.overrideLimit.reason;
  }

  const { error } = await db.schema("hotel").from("reservations").update(update).eq("tenant_id", params.tenantId).eq("id", r.id).eq("status", "confirmed");
  if (error) {
    const friendly = friendlyReservationError(error.message);
    if (friendly) return { ok: false, error: friendly.text, code: friendly.kind };
    console.error("[changeReservation]", error);
    return { ok: false, error: "The booking couldn't be changed." };
  }

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.userId,
    action: "reservation_changed",
    entityType: "reservation",
    entityId: r.id,
    before: { arrival: result.before.arrivalDay, departure: result.before.departureDay, room: result.before.roomCode, total_room_charges: plan.oldTotalRoom },
    after: {
      arrival: plan.arrivalDay,
      departure: plan.departureDay,
      room: afterRoom,
      total_room_charges: plan.newTotalRoom,
      ...(params.overrideLimit ? { overbooking_override: params.overrideLimit.reason } : {}),
    },
  });

  return result;
}

/** Plain words describing a change, for the booking history and the guest's email. */
export function describeChange(res: Extract<ChangeResult, { ok: true }>): string[] {
  const out: string[] = [];
  const { before, after, plan } = res;
  if (before.arrivalDay !== after.arrivalDay || before.departureDay !== after.departureDay) {
    out.push(
      `Dates changed from ${formatDayShort(before.arrivalDay)} – ${formatDayShort(before.departureDay)} to ${formatDayShort(after.arrivalDay)} – ${formatDayShort(after.departureDay)} (${plan.nights} night${plan.nights === 1 ? "" : "s"}).`,
    );
  }
  if (before.roomCode !== after.roomCode) {
    out.push(after.roomCode ? `Room ${before.roomCode ? `${before.roomCode} changed to ` : "set to "}${after.roomCode}.` : "Room taken off the booking until one is chosen.");
  }
  return out;
}

export { addDays };
