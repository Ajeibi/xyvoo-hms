export type CheckInRoomUnit = {
  roomCode: string;
  floor: number;
  status: string;
  /** `hotel.room_units.room_type_code` — same id as tenant `room_types[].id`. Drives occupancy when a room is assigned at check-in. */
  roomTypeCode: string;
  /** Display name from tenant room types (optional for older callers). */
  roomTypeName?: string;
};

/** Rooms that cannot be assigned at check-in (aligned with front-desk / inventory rules). */
export function canAssignRoomUnit(status: string): boolean {
  const s = status.toLowerCase();
  return s !== "occupied" && s !== "maintenance" && s !== "out_of_order";
}

export function groupRoomUnitsByFloor(
  rooms: CheckInRoomUnit[],
): { floor: number; rooms: CheckInRoomUnit[] }[] {
  const byFloor = new Map<number, CheckInRoomUnit[]>();
  for (const r of rooms) {
    const f = typeof r.floor === "number" && Number.isFinite(r.floor) ? r.floor : 0;
    const list = byFloor.get(f) ?? [];
    list.push(r);
    byFloor.set(f, list);
  }
  return [...byFloor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([floor, list]) => ({
      floor,
      rooms: list.sort((a, b) => a.roomCode.localeCompare(b.roomCode, undefined, { numeric: true })),
    }));
}

export function resolveAssignableRoomCode(
  requested: string | undefined,
  units: CheckInRoomUnit[],
): string {
  const code = (requested ?? "").trim();
  if (!code) return "";
  const row = units.find((r) => r.roomCode === code);
  return row && canAssignRoomUnit(row.status) ? code : "";
}
