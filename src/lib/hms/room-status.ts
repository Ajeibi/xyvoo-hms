import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

export const ROOM_UNIT_STATUSES = [
  "occupied",
  "vacant_clean",
  "dirty",
  "inspected",
  "maintenance",
  "out_of_order",
  "cleaning_in_progress",
  "ready_for_occupancy",
] as const;
export type RoomUnitStatus = (typeof ROOM_UNIT_STATUSES)[number];

/**
 * The one place that writes `hotel.room_units.status`. Every feature that changes a room's
 * physical/workflow state should go through this (or `setRoomStatus` below) instead of its own
 * raw `.update()` — that's exactly the bug class that hit priority-clean (never wrote it),
 * unblock (never restored it), and the first cut of manual housekeeping tasks (checked the wrong
 * set of "available" statuses). Centralizing the write doesn't stop a caller from choosing the
 * wrong status, but it does stop a new call site from forgetting the write exists at all.
 */
export async function writeRoomStatus(
  service: SupabaseClient,
  params: {
    tenantId: string;
    roomUnitId: string;
    status: RoomUnitStatus;
    /** Extra columns to update in the same write, e.g. `{ notes }` on checkout. */
    extra?: Record<string, unknown>;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await service
    .schema("hotel")
    .from("room_units")
    .update({ status: params.status, ...(params.extra ?? {}) })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.roomUnitId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * `writeRoomStatus` plus the generic "room_status_changed" audit entry — for call sites that
 * don't already log a more specific domain event for this same change (housekeeping's own
 * inspect/transition flow logs `housekeeping_inspection_passed`/`_failed`/`_advanced` instead,
 * so those call `writeRoomStatus` directly rather than doubling up on audit entries).
 */
export async function setRoomStatus(
  service: SupabaseClient,
  params: {
    tenantId: string;
    roomUnitId: string;
    status: RoomUnitStatus;
    actorUserId: string | null;
    roomCode?: string | null;
    previousStatus?: string | null;
    extra?: Record<string, unknown>;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await writeRoomStatus(service, params);
  if (!result.ok) return result;

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "room_status_changed",
    entityType: "room_unit",
    entityId: params.roomUnitId,
    before:
      params.previousStatus !== undefined
        ? { status: params.previousStatus, room_code: params.roomCode ?? null }
        : undefined,
    after: { status: params.status, room_code: params.roomCode ?? null },
  });

  return { ok: true };
}
