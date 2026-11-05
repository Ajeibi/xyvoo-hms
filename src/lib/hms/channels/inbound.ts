import type { SupabaseClient } from "@supabase/supabase-js";
import { emitNotification, writeAuditLog } from "@/lib/hms/front-desk-ops";
import { cancelReservation } from "@/lib/hms/reservation-cancellation";
import { changeReservation } from "@/lib/hms/reservation-changes";
import { createReservation } from "@/lib/hms/reservation-create";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { lagosToday, loadMaps, markNightsDirty, refOf, type ChannelConnection, type ChannelTenant, type RateMap, type RoomMap } from "./sync";
import type { ChannelProvider, InboundBooking, InboundRoom } from "./types";

/*
 * Bringing bookings, changes and cancellations in. The rules, in order:
 *   1. Store the message (one row per provider message id). A repeat finds the row and does nothing new.
 *   2. Acknowledge it to the provider: it is safely ours now.
 *   3. Claim it, so a webhook and the poller can't both act on it, then apply it with the front desk's
 *      own functions (createReservation, changeReservation, cancelReservation) so every rule of a desk
 *      booking holds. One reservation per room, unique per (booking, room), so even a crash and retry
 *      cannot make two.
 *   4. The database refuses a channel booking that would overbook (trigger guard_channel_booking_stock).
 *      When that happens nothing is kept, staff are told, and the nights are sent again as sold out.
 */

/** The channel has no signed-in staff member. Same convention as the website booking. */
const CHANNEL_ACTOR = null as unknown as string;

export type InboundOutcome = { status: "applied" | "needs_attention" | "ignored"; message: string; reservationIds: string[] };
export type ReceiveResult = InboundOutcome & { replay: boolean };

type ResRow = { id: string; status: string; channel_room_index: number | null; arrival_at: string; departure_at: string; room_type_code: string };

const day = (iso: string) => iso.slice(0, 10);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function roomName(tenant: ChannelTenant, code: string) {
  return normalizeRoomTypes(tenant.room_types).find((t) => t.id === code)?.name ?? code;
}

async function reservationsFor(db: SupabaseClient, tenantId: string, bookingRef: string): Promise<ResRow[]> {
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,status,channel_room_index,arrival_at,departure_at,room_type_code")
    .eq("tenant_id", tenantId)
    .eq("channel_booking_ref", bookingRef)
    .order("channel_room_index", { ascending: true });
  return (data ?? []) as ResRow[];
}

function mapRoom(room: InboundRoom, maps: { rooms: RoomMap[]; rates: RateMap[] }) {
  const type = maps.rooms.find((m) => m.external_room_type_id === room.externalRoomTypeId);
  if (!type) return null;
  const plan = room.externalRatePlanId ? maps.rates.find((m) => m.external_rate_plan_id === room.externalRatePlanId && m.room_type_code === type.room_type_code) : undefined;
  return { roomTypeCode: type.room_type_code, planCode: plan?.plan_code ?? null };
}

/** Cancels rooms made a moment ago when a later room of the same booking can't be had. */
async function undoRooms(db: SupabaseClient, tenantId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db
    .schema("hotel")
    .from("reservations")
    .update({ status: "cancelled", room_unit_id: null, cancel_reason: "The channel booking could not be placed in full, so no room was kept." })
    .eq("tenant_id", tenantId)
    .in("id", ids);
}

function remarks(b: InboundBooking, room: InboundRoom) {
  const parts = [`Booked on ${b.channelName}${b.channelReservationCode ? `, confirmation ${b.channelReservationCode}` : ""}.`];
  if (b.paymentCollect === "channel") parts.push("The channel collects payment (prepaid or virtual card). Do not charge the guest for the room unless the channel says so.");
  if (b.paymentCollect === "property") parts.push("Guest pays the hotel at the property.");
  if (b.notes) parts.push(`Guest request: ${b.notes}`);
  if (room.amount !== null) parts.push(`Channel price for this room: ${room.amount}${b.currency ? ` ${b.currency}` : ""}.`);
  return parts.join(" ");
}

async function applyNew(db: SupabaseClient, tenant: ChannelTenant, b: InboundBooking, maps: { rooms: RoomMap[]; rates: RateMap[] }, existing: ResRow[]): Promise<InboundOutcome> {
  const today = lagosToday();
  const have = new Set(existing.map((r) => r.channel_room_index));
  const roomTypes = normalizeRoomTypes(tenant.room_types);
  const pricing = normalizePricingSetup(tenant.pricing_setup);

  // Check every room before making any.
  for (const [i, room] of b.rooms.entries()) {
    if (have.has(i)) continue;
    if (!mapRoom(room, maps)) return { status: "needs_attention", message: `A room on this booking isn't matched to any of your room types (${room.externalRoomTypeId}). Match it under Channels, then press Try again.`, reservationIds: [] };
    if (room.arrival < today) return { status: "needs_attention", message: `The arrival date (${room.arrival}) has already passed, so the booking can't be placed automatically.`, reservationIds: [] };
  }

  const ids = existing.map((r) => r.id);
  const made: string[] = [];
  for (const [i, room] of b.rooms.entries()) {
    if (have.has(i)) continue;
    const m = mapRoom(room, maps)!;
    const result = await createReservation(db, {
      tenantId: tenant.id,
      userId: CHANNEL_ACTOR,
      roomTypes,
      pricing,
      today,
      arrivalDay: room.arrival,
      departureDay: room.departure,
      roomTypeCode: m.roomTypeCode,
      adults: room.adults,
      children: room.children,
      newGuest: { firstName: b.guest.firstName, lastName: b.guest.lastName, phone: b.guest.phone || "Not given", email: b.guest.email },
      source: "ota",
      bookingChannel: b.channelName,
      marketSegment: "transient",
      notes: remarks(b, room),
      ratePlan: m.planCode,
      // The channel has already sold it at its own price and rules; the stock guard still applies.
      overrideRestrictions: { reason: `Sold by ${b.channelName}` },
    });
    if (!result.ok) {
      await undoRooms(db, tenant.id, made);
      await markNightsDirty(db, tenant.id, m.roomTypeCode, room.arrival, room.departure);
      const full = result.code === "type_full" || result.code === "room_taken";
      return {
        status: "needs_attention",
        message: full
          ? `Overbooking prevented: no ${roomName(tenant, m.roomTypeCode)} is free for ${room.arrival} to ${room.departure}. The booking was NOT added to your rooms. Rebook the guest (or ask the channel to move them), then press Done. The channel is being told these nights are sold out.`
          : `${result.error} The booking was not added. Handle it at the desk, then press Done.`,
        reservationIds: [],
      };
    }
    made.push(result.reservationId);
    ids.push(result.reservationId);
    await db
      .schema("hotel")
      .from("reservations")
      .update({
        channel_name: b.channelName,
        channel_booking_ref: b.bookingRef,
        channel_room_index: i,
        channel_reservation_code: b.channelReservationCode,
        channel_amount: room.amount,
        channel_commission: b.commission !== null && b.rooms.length > 0 ? Math.round((b.commission / b.rooms.length) * 100) / 100 : null,
        channel_currency: b.currency,
        channel_payment_collect: b.paymentCollect,
      })
      .eq("tenant_id", tenant.id)
      .eq("id", result.reservationId);
    await writeAuditLog({ tenantId: tenant.id, actorUserId: null, action: "channel_booking_received", entityType: "reservation", entityId: result.reservationId, after: { channel: b.channelName, channel_ref: b.channelReservationCode, booking_ref: b.bookingRef, room_index: i } });
  }
  return { status: "applied", message: `${plural(made.length || ids.length, "room")} booked from ${b.channelName}${b.channelReservationCode ? ` (${b.channelReservationCode})` : ""}.`, reservationIds: ids };
}

async function applyModified(db: SupabaseClient, tenant: ChannelTenant, b: InboundBooking, maps: { rooms: RoomMap[]; rates: RateMap[] }, existing: ResRow[]): Promise<InboundOutcome> {
  const live = existing.filter((r) => r.status !== "cancelled");
  if (live.length === 0) {
    // A change that arrives before (or without) the booking itself is treated as the booking.
    return applyNew(db, tenant, b, maps, []);
  }
  if (b.rooms.length !== live.length) {
    return { status: "needs_attention", message: `${b.channelName} changed the number of rooms (${live.length} to ${b.rooms.length}). Change the booking by hand, then press Done.`, reservationIds: live.map((r) => r.id) };
  }
  const roomTypes = normalizeRoomTypes(tenant.room_types);
  const pricing = normalizePricingSetup(tenant.pricing_setup);
  const today = lagosToday();
  const done: string[] = [];
  for (const res of live) {
    const room = b.rooms[res.channel_room_index ?? 0] ?? b.rooms[0];
    if (res.status !== "confirmed") {
      return { status: "needs_attention", message: `${b.channelName} changed a booking whose guest is already in the house (${res.status}). Change it at the desk, then press Done.`, reservationIds: live.map((r) => r.id) };
    }
    const m = mapRoom(room, maps);
    if (!m) return { status: "needs_attention", message: `The changed room isn't matched to any of your room types (${room.externalRoomTypeId}).`, reservationIds: live.map((r) => r.id) };
    if (m.roomTypeCode !== res.room_type_code) {
      return { status: "needs_attention", message: `${b.channelName} moved the guest to a different room type (${roomName(tenant, res.room_type_code)} to ${roomName(tenant, m.roomTypeCode)}). Change it by hand, then press Done.`, reservationIds: live.map((r) => r.id) };
    }
    if (day(res.arrival_at) !== room.arrival || day(res.departure_at) !== room.departure) {
      const changed = await changeReservation(db, { tenantId: tenant.id, reservationId: res.id, userId: CHANNEL_ACTOR, change: { arrivalDay: room.arrival, departureDay: room.departure }, roomTypes, pricing, today, overrideRestrictions: { reason: `Changed by ${b.channelName}` } });
      if (!changed.ok) {
        await markNightsDirty(db, tenant.id, m.roomTypeCode, room.arrival, room.departure);
        const full = changed.code === "type_full" || changed.code === "room_taken";
        return {
          status: "needs_attention",
          message: full
            ? `Overbooking prevented: ${b.channelName} moved this stay to ${room.arrival}–${room.departure} but no ${roomName(tenant, m.roomTypeCode)} is free then. The booking keeps its old dates (${day(res.arrival_at)}–${day(res.departure_at)}). Talk to the guest or the channel, then press Done.`
            : `${changed.error} The booking keeps its old dates. Handle it at the desk, then press Done.`,
          reservationIds: live.map((r) => r.id),
        };
      }
    }
    await db
      .schema("hotel")
      .from("reservations")
      .update({ channel_amount: room.amount, channel_commission: b.commission !== null ? Math.round((b.commission / b.rooms.length) * 100) / 100 : null, channel_payment_collect: b.paymentCollect })
      .eq("tenant_id", tenant.id)
      .eq("id", res.id);
    await writeAuditLog({ tenantId: tenant.id, actorUserId: null, action: "channel_booking_changed", entityType: "reservation", entityId: res.id, after: { channel: b.channelName, arrival: room.arrival, departure: room.departure } });
    done.push(res.id);
  }
  return { status: "applied", message: `${b.channelName} changed the booking: updated ${plural(done.length, "room")}.`, reservationIds: done };
}

async function applyCancelled(db: SupabaseClient, tenant: ChannelTenant, b: InboundBooking, existing: ResRow[]): Promise<InboundOutcome> {
  if (existing.length === 0) return { status: "ignored", message: `${b.channelName} cancelled a booking we never received, so there is nothing to cancel.`, reservationIds: [] };
  const today = lagosToday();
  const ids: string[] = [];
  for (const res of existing) {
    if (res.status === "cancelled") {
      ids.push(res.id);
      continue;
    }
    if (res.status !== "confirmed") {
      return { status: "needs_attention", message: `${b.channelName} cancelled a booking whose guest is already in the house (${res.status}). Settle the stay at the desk, then press Done.`, reservationIds: existing.map((r) => r.id) };
    }
    // The channel's own cancellation rules apply to what the guest owes it; the hotel's fee is not charged on top.
    const result = await cancelReservation(db, { tenantId: tenant.id, reservationId: res.id, userId: CHANNEL_ACTOR, today, reason: `Cancelled on ${b.channelName}${b.channelReservationCode ? ` (${b.channelReservationCode})` : ""}.`, waiveFee: true });
    if (!result.ok) return { status: "needs_attention", message: `${result.error} Cancel it at the desk, then press Done.`, reservationIds: existing.map((r) => r.id) };
    ids.push(res.id);
  }
  return { status: "applied", message: `${b.channelName} cancelled the booking; ${plural(ids.length, "room")} freed.`, reservationIds: ids };
}

/** Applies one stored message. Safe to call again for the same message. */
export async function applyBooking(db: SupabaseClient, tenant: ChannelTenant, b: InboundBooking): Promise<InboundOutcome> {
  try {
    const maps = await loadMaps(db, tenant.id);
    const existing = await reservationsFor(db, tenant.id, b.bookingRef);
    if (b.status === "new") return await applyNew(db, tenant, b, maps, existing);
    if (b.status === "modified") return await applyModified(db, tenant, b, maps, existing);
    return await applyCancelled(db, tenant, b, existing);
  } catch (e) {
    console.error("[channels] apply failed", e);
    return { status: "needs_attention", message: "Something went wrong while placing this booking. Press Try again; if it keeps failing, enter it by hand.", reservationIds: [] };
  }
}

/**
 * The whole inbound path for one message: store, acknowledge, claim, apply, record the result.
 * Calling it twice for the same message (a retried webhook, the poller, a second server) is harmless.
 */
export async function receiveBooking(db: SupabaseClient, provider: ChannelProvider, conn: ChannelConnection, tenant: ChannelTenant, b: InboundBooking): Promise<ReceiveResult> {
  const table = () => db.schema("hotel").from("channel_inbox");
  const inserted = await table()
    .insert({ tenant_id: tenant.id, provider: provider.id, revision_id: b.revisionId, booking_ref: b.bookingRef, kind: b.status, channel_name: b.channelName, normalized: b })
    .select("id")
    .single();
  let inboxId: string;
  let replay = false;
  if (inserted.error || !inserted.data) {
    if (inserted.error?.code !== "23505") return { status: "needs_attention", message: "The booking couldn't be stored. It will be fetched again.", reservationIds: [], replay: false };
    replay = true;
    const { data: prior } = await table().select("id,status,message,reservation_ids,acknowledged_at").eq("tenant_id", tenant.id).eq("provider", provider.id).eq("revision_id", b.revisionId).maybeSingle();
    if (!prior) return { status: "needs_attention", message: "The booking couldn't be found again.", reservationIds: [], replay };
    inboxId = prior.id as string;
    if (!prior.acknowledged_at) {
      const ack = await provider.acknowledge(refOf(conn), b.revisionId);
      if (ack.ok) await table().update({ acknowledged_at: new Date().toISOString() }).eq("id", inboxId);
    }
    if (prior.status !== "received") return { status: prior.status as InboundOutcome["status"], message: (prior.message as string | null) ?? "", reservationIds: (prior.reservation_ids as string[]) ?? [], replay };
  } else {
    inboxId = inserted.data.id as string;
    const ack = await provider.acknowledge(refOf(conn), b.revisionId);
    if (ack.ok) await table().update({ acknowledged_at: new Date().toISOString() }).eq("id", inboxId);
  }

  // Only one caller applies a message at a time. A claim older than two minutes is treated as abandoned.
  const twoMin = new Date(Date.now() - 120_000).toISOString();
  const { data: claimed } = await table()
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", inboxId)
    .eq("status", "received")
    .or(`claimed_at.is.null,claimed_at.lt.${twoMin}`)
    .select("id,attempts");
  if (!claimed?.length) return { status: "needs_attention", message: "Being handled right now.", reservationIds: [], replay: true };

  const outcome = await applyBooking(db, tenant, b);
  await table()
    .update({ status: outcome.status, message: outcome.message, reservation_ids: outcome.reservationIds, applied_at: new Date().toISOString(), attempts: ((claimed[0].attempts as number) ?? 0) + 1 })
    .eq("id", inboxId);
  if (outcome.status === "needs_attention") {
    await emitNotification({
      tenantId: tenant.id,
      type: "reservation_cancelled",
      title: `${b.channelName} booking needs you`,
      body: outcome.message,
      severity: "warning",
      entityType: "channel_inbox",
      entityId: inboxId,
      dedupeHours: 1,
    }).catch(() => undefined);
  }
  return { ...outcome, replay };
}

/** Runs a stored message again (staff pressed Try again after fixing a mapping). */
export async function retryInbox(db: SupabaseClient, provider: ChannelProvider, conn: ChannelConnection, tenant: ChannelTenant, inboxId: string): Promise<ReceiveResult | null> {
  const { data } = await db.schema("hotel").from("channel_inbox").select("id,status,normalized").eq("tenant_id", tenant.id).eq("id", inboxId).maybeSingle();
  if (!data || data.status === "applied") return null;
  await db.schema("hotel").from("channel_inbox").update({ status: "received", claimed_at: null }).eq("id", inboxId);
  return receiveBooking(db, provider, conn, tenant, data.normalized as InboundBooking);
}

/** Staff handled it by hand. */
export async function markInboxDone(db: SupabaseClient, tenantId: string, inboxId: string, userId: string) {
  await db.schema("hotel").from("channel_inbox").update({ status: "ignored", message: "Handled by hand.", applied_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", inboxId);
  await writeAuditLog({ tenantId, actorUserId: userId, action: "channel_inbox_resolved", entityType: "channel_inbox", entityId: inboxId });
}

/** Fetches whatever the provider still has for us and applies it. Used by the cron and "Check now". */
export async function pollBookings(db: SupabaseClient, provider: ChannelProvider, conn: ChannelConnection, tenant: ChannelTenant): Promise<{ ok: true; received: number; needAttention: number } | { ok: false; error: string }> {
  const pending = await provider.fetchPending(refOf(conn));
  await db.schema("hotel").from("channel_connections").update({ last_poll_at: new Date().toISOString() }).eq("tenant_id", tenant.id);
  if (!pending.ok) {
    await db.schema("hotel").from("channel_connections").update({ last_error: pending.error, last_error_at: new Date().toISOString() }).eq("tenant_id", tenant.id);
    return pending;
  }
  let needAttention = 0;
  for (const b of pending.bookings) {
    const r = await receiveBooking(db, provider, conn, tenant, b);
    if (r.status === "needs_attention") needAttention += 1;
  }
  // Messages stored but never applied (a crash between steps) are picked up again.
  const { data: stuck } = await db.schema("hotel").from("channel_inbox").select("id").eq("tenant_id", tenant.id).eq("status", "received").lt("created_at", new Date(Date.now() - 180_000).toISOString()).limit(20);
  for (const s of stuck ?? []) {
    const r = await retryInbox(db, provider, conn, tenant, s.id as string);
    if (r?.status === "needs_attention") needAttention += 1;
  }
  return { ok: true, received: pending.bookings.length, needAttention };
}
