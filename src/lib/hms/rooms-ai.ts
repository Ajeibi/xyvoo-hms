import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveBlocksForRooms } from "@/lib/hms/rooms-ops";
import { mapRoomReadiness } from "@/lib/hms/arrivals-room";

export type RoomSuggestion = {
  roomUnitId: string;
  roomCode: string;
  floor: number;
  score: number;
  reasons: string[];
};

export type MaintenanceInsight = {
  roomUnitId: string;
  roomCode: string;
  severity: "low" | "medium" | "high";
  summary: string;
  signals: string[];
};

export function scoreRoomForReservation(params: {
  room: { id: string; roomCode: string; floor: number; roomTypeCode: string };
  reservation: { room_type_code: string | null; isVip?: boolean; floorPreference?: number | null };
  readiness: string;
  hasHardBlock: boolean;
  occupied: boolean;
}): RoomSuggestion | null {
  if (params.occupied || params.hasHardBlock) return null;
  if (
    params.reservation.room_type_code &&
    params.room.roomTypeCode !== params.reservation.room_type_code
  ) {
    return null;
  }

  let score = 50;
  const reasons: string[] = [];

  if (params.readiness === "ready" || params.readiness === "inspected") {
    score += 30;
    reasons.push("Room is ready");
  } else if (params.readiness === "dirty" || params.readiness === "cleaning") {
    score -= 20;
    reasons.push("Needs cleaning");
  }

  if (params.reservation.isVip) {
    if (params.room.floor >= 3) {
      score += 10;
      reasons.push("Upper floor for VIP");
    }
  }

  if (
    params.reservation.floorPreference != null &&
    params.room.floor === params.reservation.floorPreference
  ) {
    score += 15;
    reasons.push("Matches floor preference");
  }

  return {
    roomUnitId: params.room.id,
    roomCode: params.room.roomCode,
    floor: params.room.floor,
    score,
    reasons,
  };
}

export async function suggestRoomsForReservation(
  supabase: SupabaseClient,
  tenantId: string,
  reservationId: string,
): Promise<RoomSuggestion[]> {
  const { data: reservation } = await supabase
    .schema("hotel")
    .from("reservations")
    .select("id,room_type_code,is_vip,guest_embed")
    .eq("tenant_id", tenantId)
    .eq("id", reservationId)
    .maybeSingle();

  if (!reservation) return [];

  const { data: units } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("id,room_code,floor,room_type_code,status")
    .eq("tenant_id", tenantId);

  const ids = (units ?? []).map((u) => u.id);
  const blockMap = await getActiveBlocksForRooms(supabase, tenantId, ids);

  const { data: hkRows } = await supabase
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("room_unit_id,status")
    .eq("tenant_id", tenantId)
    .in("room_unit_id", ids);

  const hkByRoom = new Map((hkRows ?? []).map((h) => [h.room_unit_id, h.status]));

  const { data: occupied } = await supabase
    .schema("hotel")
    .from("reservations")
    .select("room_unit_id")
    .eq("tenant_id", tenantId)
    .eq("status", "checked_in")
    .not("room_unit_id", "is", null);

  const occupiedIds = new Set((occupied ?? []).map((r) => r.room_unit_id));

  const suggestions: RoomSuggestion[] = [];
  for (const unit of units ?? []) {
    const blocks = blockMap.get(unit.id) ?? [];
    const hardBlock = blocks.some((b) => b.block_type !== "soft");
    const readiness = mapRoomReadiness(unit.status, hkByRoom.get(unit.id));
    const s = scoreRoomForReservation({
      room: {
        id: unit.id,
        roomCode: unit.room_code,
        floor: unit.floor,
        roomTypeCode: unit.room_type_code,
      },
      reservation: {
        room_type_code: reservation.room_type_code,
        isVip: reservation.is_vip,
      },
      readiness,
      hasHardBlock: hardBlock,
      occupied: occupiedIds.has(unit.id),
    });
    if (s) suggestions.push(s);
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function getMaintenanceInsights(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MaintenanceInsight[]> {
  const { data: units } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("id,room_code")
    .eq("tenant_id", tenantId);

  const { data: incidents } = await supabase
    .schema("hotel")
    .from("room_incidents")
    .select("room_unit_id,status,created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString());

  const { data: blocks } = await supabase
    .schema("hotel")
    .from("room_blocks")
    .select("room_unit_id,active")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  const incidentCount = new Map<string, number>();
  for (const i of incidents ?? []) {
    if (i.status === "closed") continue;
    incidentCount.set(i.room_unit_id, (incidentCount.get(i.room_unit_id) ?? 0) + 1);
  }

  const blockCount = new Map<string, number>();
  for (const b of blocks ?? []) {
    blockCount.set(b.room_unit_id, (blockCount.get(b.room_unit_id) ?? 0) + 1);
  }

  const insights: MaintenanceInsight[] = [];
  for (const unit of units ?? []) {
    const inc = incidentCount.get(unit.id) ?? 0;
    const blk = blockCount.get(unit.id) ?? 0;
    if (inc === 0 && blk === 0) continue;

    const signals: string[] = [];
    if (inc > 0) signals.push(`${inc} open incident(s)`);
    if (blk > 0) signals.push(`${blk} active block(s)`);

    let severity: MaintenanceInsight["severity"] = "low";
    if (inc >= 2 || blk >= 2) severity = "high";
    else if (inc >= 1 || blk >= 1) severity = "medium";

    insights.push({
      roomUnitId: unit.id,
      roomCode: unit.room_code,
      severity,
      summary: `Room ${unit.room_code} needs attention`,
      signals,
    });
  }

  return insights.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}
