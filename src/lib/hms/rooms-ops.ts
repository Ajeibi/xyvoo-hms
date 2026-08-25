import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertRoomAssignable,
  type RoomAssignCheckResult,
  type RoomUnitSnapshot,
} from "@/lib/hms/arrivals-room";
import { writeRoomStatus } from "@/lib/hms/room-status";

export type RoomBlockRow = {
  id: string;
  room_unit_id: string;
  block_type: string;
  reason: string;
  start_at: string;
  end_at: string | null;
  notes: string | null;
  active: boolean;
};

export async function getActiveBlocksForRooms(
  supabase: SupabaseClient,
  tenantId: string,
  roomUnitIds: string[],
): Promise<Map<string, RoomBlockRow[]>> {
  const map = new Map<string, RoomBlockRow[]>();
  if (roomUnitIds.length === 0) return map;

  const now = new Date().toISOString();
  const { data } = await supabase
    .schema("hotel")
    .from("room_blocks")
    .select("id,room_unit_id,block_type,reason,start_at,end_at,notes,active")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .in("room_unit_id", roomUnitIds);

  for (const row of data ?? []) {
    if (row.end_at && row.end_at < now) continue;
    if (row.start_at > now) continue;
    const list = map.get(row.room_unit_id) ?? [];
    list.push(row as RoomBlockRow);
    map.set(row.room_unit_id, list);
  }
  return map;
}

export function hasHardBlock(blocks: RoomBlockRow[] | undefined): boolean {
  if (!blocks?.length) return false;
  return blocks.some((b) => b.block_type !== "soft");
}

export function assertRoomAssignableWithBlocks(
  unit: RoomUnitSnapshot,
  hkStatus: string | null | undefined,
  blocks: RoomBlockRow[] | undefined,
  options?: { allowDirtyOverride?: boolean; allowBlockOverride?: boolean },
): RoomAssignCheckResult {
  if (blocks?.length && !options?.allowBlockOverride) {
    const hard = hasHardBlock(blocks);
    if (hard) {
      return {
        ok: false,
        reason: "maintenance",
        message: "Room has an active block. Manager approval required.",
        requiresOverride: true,
      };
    }
  }
  return assertRoomAssignable(unit, hkStatus, options);
}

export async function assignReservationToRoom(params: {
  supabase: SupabaseClient;
  tenantId: string;
  reservationId: string;
  roomUnitId: string | null;
  allowDirtyOverride?: boolean;
  allowBlockOverride?: boolean;
}): Promise<{ ok: true; roomCode?: string } | { ok: false; error: string; requiresPin?: boolean }> {
  const { data: reservation } = await params.supabase
    .schema("hotel")
    .from("reservations")
    .select("id,room_unit_id,status")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservationId)
    .maybeSingle();

  if (!reservation) return { ok: false, error: "Reservation not found." };
  if (!["confirmed", "checked_in"].includes(reservation.status)) {
    return { ok: false, error: "Room can only be assigned to confirmed or in-house stays." };
  }

  if (params.roomUnitId === null) {
    await params.supabase
      .schema("hotel")
      .from("reservations")
      .update({ room_unit_id: null })
      .eq("id", params.reservationId);
    return { ok: true };
  }

  const { data: unit } = await params.supabase
    .schema("hotel")
    .from("room_units")
    .select("id,room_code,floor,room_type_code,status")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.roomUnitId)
    .maybeSingle();

  if (!unit) return { ok: false, error: "Room not found." };

  const { data: blocking } = await params.supabase
    .schema("hotel")
    .from("reservations")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("room_unit_id", unit.id)
    .eq("status", "checked_in")
    .neq("id", params.reservationId)
    .maybeSingle();

  if (blocking) return { ok: false, error: "Room is already occupied." };

  const { data: hk } = await params.supabase
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("status")
    .eq("tenant_id", params.tenantId)
    .eq("room_unit_id", unit.id)
    .maybeSingle();

  const blockMap = await getActiveBlocksForRooms(params.supabase, params.tenantId, [unit.id]);
  const check = assertRoomAssignableWithBlocks(
    unit,
    hk?.status,
    blockMap.get(unit.id),
    {
      allowDirtyOverride: params.allowDirtyOverride,
      allowBlockOverride: params.allowBlockOverride,
    },
  );

  if (!check.ok) {
    return {
      ok: false,
      error: check.message,
      requiresPin: check.requiresOverride,
    };
  }

  await params.supabase
    .schema("hotel")
    .from("reservations")
    .update({ room_unit_id: unit.id, room_type_code: unit.room_type_code })
    .eq("id", params.reservationId);

  if (reservation.status === "checked_in") {
    await writeRoomStatus(params.supabase, {
      tenantId: params.tenantId,
      roomUnitId: unit.id,
      status: "occupied",
    });
  }

  return { ok: true, roomCode: unit.room_code };
}
