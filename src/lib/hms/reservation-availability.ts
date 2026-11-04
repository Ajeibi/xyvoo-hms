import type { SupabaseClient } from "@supabase/supabase-js";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { addDays, dayOf, summariseAvailability, type NightCount, type TypeAvailability } from "@/lib/hms/reservation-availability-shared";

export * from "@/lib/hms/reservation-availability-shared";

/*
 * Which rooms and how many of each type are free for a run of nights. The counting itself is done
 * in the database (hotel.room_type_night_counts) so that this screen and the rule that refuses an
 * over-sold booking use exactly the same numbers.
 */

/** Per night counts for one room type. `exclude` leaves one booking out (the one being edited). */
export async function nightCountsForType(
  db: SupabaseClient,
  params: { tenantId: string; roomTypeCode: string; fromDay: string; toDay: string; excludeReservationId?: string | null },
): Promise<NightCount[]> {
  const { data, error } = await db.schema("hotel").rpc("room_type_night_counts", {
    p_tenant: params.tenantId,
    p_type: params.roomTypeCode,
    p_from: params.fromDay,
    p_to: params.toDay,
    p_exclude: params.excludeReservationId ?? null,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    night: String(r.night).slice(0, 10),
    stock: Number(r.stock) || 0,
    overbook: Number(r.overbook) || 0,
    sold: Number(r.sold) || 0,
    held: Number(r.held) || 0,
  }));
}

/** Availability of every room type for the nights from `fromDay` up to (not including) `toDay`. */
export async function availabilityByType(
  db: SupabaseClient,
  params: { tenantId: string; roomTypes: HotelRoomTypeSetup[]; fromDay: string; toDay: string; excludeReservationId?: string | null },
): Promise<TypeAvailability[]> {
  return Promise.all(
    params.roomTypes.map(async (t) =>
      summariseAvailability(
        t.id,
        t.name,
        await nightCountsForType(db, { tenantId: params.tenantId, roomTypeCode: t.id, fromDay: params.fromDay, toDay: params.toDay, excludeReservationId: params.excludeReservationId }),
      ),
    ),
  );
}

export type FreeRoom = { id: string; roomCode: string; floor: number; roomTypeCode: string; status: string };

/**
 * Rooms of a hotel (optionally of one type) that nobody holds on any night from `fromDay` up to
 * `toDay`: no booking that is coming or in the house, and no hard block. Same-day turnover is fine.
 */
export async function findFreeRooms(
  db: SupabaseClient,
  params: { tenantId: string; fromDay: string; toDay: string; roomTypeCode?: string | null; excludeReservationId?: string | null },
): Promise<FreeRoom[]> {
  let unitQuery = db
    .schema("hotel")
    .from("room_units")
    .select("id,room_code,floor,room_type_code,status")
    .eq("tenant_id", params.tenantId)
    .neq("status", "out_of_order")
    .order("floor", { ascending: true })
    .order("room_code", { ascending: true });
  if (params.roomTypeCode) unitQuery = unitQuery.eq("room_type_code", params.roomTypeCode);
  const { data: units } = await unitQuery;
  if (!units?.length) return [];

  const ids = units.map((u) => u.id as string);
  const wideFrom = `${addDays(params.fromDay, -1)}T00:00:00Z`;
  const wideTo = `${addDays(params.toDay, 1)}T23:59:59Z`;
  const [{ data: bookings }, { data: blocks }] = await Promise.all([
    db
      .schema("hotel")
      .from("reservations")
      .select("id,room_unit_id,arrival_at,departure_at")
      .eq("tenant_id", params.tenantId)
      .in("room_unit_id", ids)
      .in("status", ["confirmed", "checked_in"])
      .lt("arrival_at", wideTo)
      .gt("departure_at", wideFrom),
    db
      .schema("hotel")
      .from("room_blocks")
      .select("room_unit_id,start_at,end_at,block_type")
      .eq("tenant_id", params.tenantId)
      .in("room_unit_id", ids)
      .eq("active", true)
      .neq("block_type", "soft"),
  ]);

  const taken = new Set<string>();
  for (const b of bookings ?? []) {
    if (params.excludeReservationId && b.id === params.excludeReservationId) continue;
    if (dayOf(b.arrival_at as string) < params.toDay && dayOf(b.departure_at as string) > params.fromDay) taken.add(b.room_unit_id as string);
  }
  for (const b of blocks ?? []) {
    const start = dayOf(b.start_at as string);
    const end = b.end_at ? dayOf(b.end_at as string) : null;
    if (start < params.toDay && (end === null || end > params.fromDay)) taken.add(b.room_unit_id as string);
  }

  return units
    .filter((u) => !taken.has(u.id as string))
    .map((u) => ({
      id: u.id as string,
      roomCode: u.room_code as string,
      floor: Number(u.floor) || 0,
      roomTypeCode: u.room_type_code as string,
      status: String(u.status ?? ""),
    }));
}

/* ---------------- Overbooking limits ---------------- */

export type RoomTypeLimit = { roomTypeCode: string; overbookRooms: number };

export async function listRoomTypeLimits(db: SupabaseClient, tenantId: string): Promise<RoomTypeLimit[]> {
  const { data } = await db.schema("hotel").from("room_type_limits").select("room_type_code,overbook_rooms").eq("tenant_id", tenantId);
  return (data ?? []).map((r) => ({ roomTypeCode: r.room_type_code as string, overbookRooms: Number(r.overbook_rooms) || 0 }));
}

export async function saveRoomTypeLimit(
  db: SupabaseClient,
  params: { tenantId: string; roomTypeCode: string; overbookRooms: number; userId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rooms = Math.round(params.overbookRooms);
  if (!Number.isFinite(rooms) || rooms < 0 || rooms > 200) return { ok: false, error: "Use a number from 0 to 200." };
  const { error } = await db
    .schema("hotel")
    .from("room_type_limits")
    .upsert(
      { tenant_id: params.tenantId, room_type_code: params.roomTypeCode, overbook_rooms: rooms, updated_by: params.userId, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,room_type_code" },
    );
  if (error) return { ok: false, error: "The limit couldn't be saved." };
  return { ok: true };
}
