export type RoomUnitSnapshot = {
  id: string;
  room_code: string;
  floor: number;
  room_type_code: string;
  status: string;
};

export type RoomAssignBlockReason =
  | "not_found"
  | "occupied"
  | "out_of_order"
  | "maintenance"
  | "dirty"
  | "cleaning";

export type RoomAssignCheckResult =
  | { ok: true }
  | { ok: false; reason: RoomAssignBlockReason; message: string; requiresOverride: boolean };

const DIRTY_STATUSES = new Set(["dirty", "cleaning_in_progress"]);
const BLOCKED_STATUSES = new Set(["out_of_order", "maintenance"]);

export function mapRoomReadiness(
  unitStatus: string,
  hkStatus?: string | null,
): "ready" | "dirty" | "cleaning" | "inspected" | "maintenance" {
  if (BLOCKED_STATUSES.has(unitStatus)) return "maintenance";
  if (unitStatus === "out_of_order") return "maintenance";
  if (DIRTY_STATUSES.has(unitStatus) || hkStatus === "dirty" || hkStatus === "cleaning_in_progress") {
    if (hkStatus === "cleaning_in_progress" || unitStatus === "cleaning_in_progress") return "cleaning";
    return "dirty";
  }
  if (unitStatus === "inspected" || hkStatus === "inspected") return "inspected";
  if (
    unitStatus === "vacant_clean" ||
    unitStatus === "ready_for_occupancy" ||
    unitStatus === "inspected"
  ) {
    return "ready";
  }
  if (unitStatus === "occupied") return "ready";
  return "dirty";
}

export function assertRoomAssignable(
  unit: RoomUnitSnapshot,
  hkStatus?: string | null,
  options?: { allowDirtyOverride?: boolean },
): RoomAssignCheckResult {
  if (BLOCKED_STATUSES.has(unit.status)) {
    return {
      ok: false,
      reason: unit.status === "maintenance" ? "maintenance" : "out_of_order",
      message: "Room is blocked for maintenance or out of order.",
      requiresOverride: true,
    };
  }
  const readiness = mapRoomReadiness(unit.status, hkStatus);
  if (readiness === "dirty" || readiness === "cleaning") {
    if (options?.allowDirtyOverride) return { ok: true };
    return {
      ok: false,
      reason: readiness === "cleaning" ? "cleaning" : "dirty",
      message: "Room is not clean/ready. Manager PIN required to override.",
      requiresOverride: true,
    };
  }
  return { ok: true };
}
