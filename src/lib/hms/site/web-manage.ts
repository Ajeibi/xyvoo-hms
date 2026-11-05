import type { SupabaseClient } from "@supabase/supabase-js";
import { emitNotification } from "@/lib/hms/front-desk-ops";
import { cancelReservation, previewCancellation } from "@/lib/hms/reservation-cancellation";
import { changeReservation, describeChange } from "@/lib/hms/reservation-changes";
import { sendReservationEmail } from "@/lib/hms/reservation-emails";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { describePolicy } from "@/lib/hms/reservation-cancellation-shared";
import { loadStayUpsells } from "@/lib/hms/upsells";
import { webOffer } from "./web-quote";
import { money2, sameEmail, stayDatesProblem } from "./web-shared";
import type { WebHotel } from "./web-booking";

/*
 * A guest looks after their own booking on the hotel's website: see it, move the dates, cancel.
 * They prove it is theirs with the booking code and the email on it; a wrong pair gets the same
 * answer as a code that doesn't exist. Changes and cancellations go through the front desk's own
 * functions, so the same price, restriction, availability and cancellation rules apply, and the
 * database refuses a room that isn't there.
 */

const WEB_ACTOR = null as unknown as string;

const COLUMNS =
  "id,confirmation_code,status,arrival_at,departure_at,nights,adults,children_json,room_type_code,pricing_snapshot,total_room_charges,deposit_required,deposit_due_date,cancellation_fee,cancellation_fee_status,rate_plan_code,reservation_guests(is_primary,guests(first_name,last_name,email))";

type GuestEmbed = { first_name: string; last_name: string; email: string | null };

export type WebBookingRow = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  nights: number;
  adults: number;
  children_json: unknown;
  room_type_code: string;
  pricing_snapshot: Record<string, unknown> | null;
  total_room_charges: number | string;
  deposit_required: number | string | null;
  deposit_due_date: string | null;
  cancellation_fee: number | string | null;
  cancellation_fee_status: string | null;
  rate_plan_code: string | null;
  reservation_guests: { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[] | null;
};

export type WebBookingView = {
  code: string;
  status: "confirmed" | "checked_in" | "cancelled" | "other";
  guestName: string;
  roomName: string;
  planName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  total: number;
  deposit: { required: number; dueDate: string | null; paid: number };
  cancellation: string[];
  /** What cancelling now would cost under the terms the booking was made on. */
  cancelNow: { fee: number; summary: string } | null;
  addons: { name: string; amount: number }[];
  canChange: boolean;
  canCancel: boolean;
  /** Why the guest can't do it online, when they can't. */
  blocked: string | null;
  cancellationFee: number;
};

export async function findWebBooking(db: SupabaseClient, tenantId: string, code: string, email: string): Promise<WebBookingRow | null> {
  if (!code || !email) return null;
  const { data } = await db.schema("hotel").from("reservations").select(COLUMNS).eq("tenant_id", tenantId).eq("confirmation_code", code).maybeSingle();
  if (!data) return null;
  const row = data as unknown as WebBookingRow;
  const emails = (row.reservation_guests ?? []).flatMap((l) => (Array.isArray(l.guests) ? l.guests : l.guests ? [l.guests] : [])).map((g) => g.email);
  return emails.some((e) => sameEmail(e, email)) ? row : null;
}

const totalOf = (r: Pick<WebBookingRow, "pricing_snapshot" | "total_room_charges">) => {
  const snap = r.pricing_snapshot as { taxes?: { grandTotal?: number } } | null;
  return Number(snap?.taxes?.grandTotal) > 0 ? Number(snap!.taxes!.grandTotal) : Number(r.total_room_charges) || 0;
};

async function planIsRefundable(db: SupabaseClient, tenantId: string, code: string | null): Promise<boolean> {
  if (!code) return true;
  const { data } = await db.schema("hotel").from("rate_plans").select("refundable").eq("tenant_id", tenantId).eq("code", code).maybeSingle();
  return data ? data.refundable !== false : true;
}

export async function viewWebBooking(db: SupabaseClient, tenant: WebHotel, row: WebBookingRow, today: string): Promise<WebBookingView> {
  const pricing = normalizePricingSetup(tenant.pricing_setup);
  const roomName = normalizeRoomTypes(tenant.room_types).find((t) => t.id === row.room_type_code)?.name ?? "Room";
  const links = row.reservation_guests ?? [];
  const primary = links.find((l) => l.is_primary) ?? links[0];
  const g = Array.isArray(primary?.guests) ? primary?.guests[0] : primary?.guests;
  const status = row.status === "confirmed" || row.status === "checked_in" || row.status === "cancelled" ? row.status : "other";
  const refundable = await planIsRefundable(db, tenant.id, row.rate_plan_code);

  const [preview, upsells, deposits] = await Promise.all([
    status === "confirmed" ? previewCancellation(db, { tenantId: tenant.id, reservationId: row.id, today }) : Promise.resolve(null),
    loadStayUpsells(db, tenant.id, row.id),
    db.schema("hotel").from("reservation_deposits").select("amount,status").eq("tenant_id", tenant.id).eq("reservation_id", row.id),
  ]);
  const paid = money2((deposits.data ?? []).filter((d) => d.status !== "refunded").reduce((s, d) => s + (Number(d.amount) || 0), 0));
  const future = row.arrival_at.slice(0, 10) >= today;
  let blocked: string | null = null;
  if (status === "checked_in") blocked = "You are staying with us now. Please speak to the front desk about any change.";
  else if (status !== "confirmed") blocked = status === "cancelled" ? "This booking has been cancelled." : "Please contact the hotel about this booking.";
  else if (!future) blocked = "The arrival date has passed. Please contact the hotel.";
  else if (!refundable) blocked = "This rate is non-refundable and can't be changed or cancelled online. Please contact the hotel.";

  return {
    code: row.confirmation_code,
    status,
    guestName: g ? `${g.first_name} ${g.last_name}`.trim() : "Guest",
    roomName,
    planName: ((row.pricing_snapshot ?? {}) as { ratePlanName?: string }).ratePlanName ?? "",
    checkIn: row.arrival_at.slice(0, 10),
    checkOut: row.departure_at.slice(0, 10),
    nights: Number(row.nights) || 1,
    adults: Number(row.adults) || 1,
    children: Array.isArray(row.children_json) ? row.children_json.length : 0,
    currency: pricing.currency,
    total: money2(totalOf(row)),
    deposit: { required: money2(Number(row.deposit_required) || 0), dueDate: row.deposit_due_date, paid },
    cancellation: preview?.ok ? describePolicy(preview.preview.policy, pricing.currency) : [],
    cancelNow: preview?.ok ? { fee: preview.preview.quote.fee, summary: preview.preview.quote.summary } : null,
    addons: upsells.map((u) => ({ name: u.name, amount: u.amount })),
    canChange: !blocked,
    canCancel: !blocked,
    blocked,
    cancellationFee: Number(row.cancellation_fee) || 0,
  };
}

export type WebChangePreview =
  | { ok: true; checkIn: string; checkOut: string; nights: number; oldTotal: number; newTotal: number; difference: number; currency: string; restrictions: string[] }
  | { ok: false; error: string };

function grandOf(taxes: unknown, fallback: number) {
  const g = Number((taxes as { grandTotal?: number } | null)?.grandTotal);
  return g > 0 ? g : fallback;
}

/** What moving a booking to new dates would cost, and whether the rate allows it. Saves nothing. */
export async function previewWebChange(db: SupabaseClient, tenant: WebHotel, row: WebBookingRow, to: { checkIn: string; checkOut: string }, today: string): Promise<WebChangePreview> {
  const problem = stayDatesProblem(to.checkIn, to.checkOut, today);
  if (problem) return { ok: false, error: problem };
  const view = await viewWebBooking(db, tenant, row, today);
  if (!view.canChange) return { ok: false, error: view.blocked ?? "This booking can't be changed online." };
  const res = await changeReservation(db, {
    tenantId: tenant.id,
    reservationId: row.id,
    userId: WEB_ACTOR,
    change: { arrivalDay: to.checkIn, departureDay: to.checkOut },
    roomTypes: normalizeRoomTypes(tenant.room_types),
    pricing: normalizePricingSetup(tenant.pricing_setup),
    today,
    preview: true,
  });
  if (!res.ok) return { ok: false, error: res.error };
  // The room-type stock for the new nights: the database refuses a sold-out type when saving, but a guest should hear it now.
  const offer = await webOffer(db, tenant, { checkIn: to.checkIn, checkOut: to.checkOut, adults: view.adults, children: view.children, rooms: 1 }, today);
  if (offer.ok) {
    const room = offer.offer.roomTypes.find((r) => r.id === row.room_type_code);
    const sameDates = to.checkIn >= view.checkIn && to.checkOut <= view.checkOut;
    if (room && !room.open && !sameDates) return { ok: false, error: `${view.roomName} isn't available for those dates.` };
  }
  const oldTotal = money2(totalOf(row));
  const newTotal = money2(grandOf(res.plan.taxes, oldTotal));
  return { ok: true, checkIn: res.plan.arrivalDay, checkOut: res.plan.departureDay, nights: res.plan.nights, oldTotal, newTotal, difference: money2(newTotal - oldTotal), currency: view.currency, restrictions: res.plan.restrictions };
}

export type WebChangeResult = { ok: true; message: string } | { ok: false; error: string };

export async function applyWebChange(db: SupabaseClient, tenant: WebHotel, row: WebBookingRow, to: { checkIn: string; checkOut: string }, today: string): Promise<WebChangeResult> {
  const preview = await previewWebChange(db, tenant, row, to, today);
  if (!preview.ok) return preview;
  if (preview.restrictions.length) return { ok: false, error: preview.restrictions.join(" ") };
  const res = await changeReservation(db, {
    tenantId: tenant.id,
    reservationId: row.id,
    userId: WEB_ACTOR,
    change: { arrivalDay: to.checkIn, departureDay: to.checkOut },
    roomTypes: normalizeRoomTypes(tenant.room_types),
    pricing: normalizePricingSetup(tenant.pricing_setup),
    today,
  });
  if (!res.ok) {
    return { ok: false, error: res.code === "type_full" || res.code === "room_taken" ? "Those dates have just been taken. Please try other dates." : res.error };
  }
  await sendReservationEmail(db, { tenantId: tenant.id, reservationId: row.id, kind: "change", userId: null, changes: describeChange(res) }).catch(() => undefined);
  await emitNotification({
    tenantId: tenant.id,
    type: "reservation_cancelled",
    title: "Guest changed a website booking",
    body: `${row.confirmation_code}: now ${to.checkIn} to ${to.checkOut}.`,
    severity: "info",
    entityType: "reservation",
    entityId: row.id,
  }).catch(() => undefined);
  return { ok: true, message: `Your booking is now ${to.checkIn} to ${to.checkOut}. We have emailed you the new details.` };
}

export type WebCancelResult = { ok: true; fee: number; message: string } | { ok: false; error: string };

export async function cancelWebBooking(db: SupabaseClient, tenant: WebHotel, row: WebBookingRow, today: string): Promise<WebCancelResult> {
  const view = await viewWebBooking(db, tenant, row, today);
  if (!view.canCancel) return { ok: false, error: view.blocked ?? "This booking can't be cancelled online." };
  const res = await cancelReservation(db, {
    tenantId: tenant.id,
    reservationId: row.id,
    userId: WEB_ACTOR,
    today,
    reason: "Cancelled by the guest on the hotel's website.",
  });
  if (!res.ok) return res;
  await db.schema("hotel").from("reservations").update({ web_cancelled_by_guest: true }).eq("tenant_id", tenant.id).eq("id", row.id);
  await sendReservationEmail(db, { tenantId: tenant.id, reservationId: row.id, kind: "cancellation", userId: null }).catch(() => undefined);
  const heldDeposit = view.deposit.paid > 0;
  await emitNotification({
    tenantId: tenant.id,
    type: "reservation_cancelled",
    title: "Guest cancelled a website booking",
    body: `${row.confirmation_code} was cancelled by the guest${res.fee > 0 ? `; fee under the policy ${res.fee}` : ""}.${heldDeposit ? " A deposit is held on it: refund it or keep it as the fee on the booking." : ""}`,
    severity: res.fee > 0 || heldDeposit ? "warning" : "info",
    entityType: "reservation",
    entityId: row.id,
  }).catch(() => undefined);
  return {
    ok: true,
    fee: res.fee,
    message: heldDeposit
      ? "Your booking is cancelled. The hotel will contact you about your deposit."
      : res.fee > 0
        ? "Your booking is cancelled. The cancellation fee under the hotel's policy will be settled by the hotel."
        : "Your booking is cancelled. No fee applies.",
  };
}
