import { isValidRoomCodeToken } from "@/lib/hms/room-numbering";

export type HotelFloorPlanEntry = {
  floor: number;
  room_count: number;
  /** When set and length matches room_count, physical keys on this floor get these room_code values (save order). */
  room_codes?: string[];
};

type FloorAcc = {
  count: number;
  /** Each chunk is a validated list equal to that row's room_count before merge. */
  codeChunks: string[][];
};

function normalizeRoomCodesField(raw: unknown, roomCount: number): string[] | undefined {
  if (!Array.isArray(raw) || roomCount < 1) return undefined;
  const codes: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") return undefined;
    const t = x.trim();
    if (!t || !isValidRoomCodeToken(t)) return undefined;
    codes.push(t);
  }
  if (codes.length !== roomCount) return undefined;
  const seen = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) return undefined;
    seen.add(c);
  }
  return codes;
}

/**
 * Parses and normalizes tenant `floor_plan` JSON.
 * Merges duplicate floor numbers by summing room counts; concatenates `room_codes` when each
 * merged row had a full-length list matching its segment count; otherwise drops `room_codes`.
 */
export function normalizeFloorPlan(raw: unknown): HotelFloorPlanEntry[] {
  if (!Array.isArray(raw)) return [];

  const acc = new Map<number, FloorAcc>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const floor = Number(o.floor);
    const roomCount = Number(o.room_count);
    if (!Number.isFinite(floor) || !Number.isFinite(roomCount)) continue;
    const fi = Math.trunc(floor);
    const rc = Math.trunc(roomCount);
    if (fi < 1 || fi > 500) continue;
    if (rc < 1 || rc > 10000) continue;

    const rcodes = normalizeRoomCodesField(o.room_codes, rc);
    const prev = acc.get(fi) ?? { count: 0, codeChunks: [] };
    prev.count += rc;
    if (rcodes && rcodes.length === rc) {
      prev.codeChunks.push(rcodes);
    }
    acc.set(fi, prev);
  }

  return [...acc.entries()]
    .map(([floor, a]) => {
      let room_codes: string[] | undefined;
      if (a.codeChunks.length > 0) {
        const merged = a.codeChunks.flat();
        if (merged.length === a.count) {
          const seen = new Set<string>();
          let uniq = true;
          for (const c of merged) {
            if (seen.has(c)) {
              uniq = false;
              break;
            }
            seen.add(c);
          }
          if (uniq) room_codes = merged;
        }
      }
      const entry: HotelFloorPlanEntry = { floor, room_count: a.count };
      if (room_codes) entry.room_codes = room_codes;
      return entry;
    })
    .sort((a, b) => a.floor - b.floor);
}

export function getFloorPlanRoomTotal(plan: HotelFloorPlanEntry[]): number {
  return plan.reduce((sum, row) => sum + row.room_count, 0);
}

/**
 * Prefer the registered profile room count when present; otherwise use the sum of
 * configured room-type inventory (e.g. legacy tenants without `hotel.profiles`).
 */
export function getFloorPlanTargetRoomCount(
  signupRoomCount: number,
  configuredRoomsFromTypes: number,
): number {
  if (signupRoomCount > 0) return signupRoomCount;
  return Math.max(0, Math.trunc(configuredRoomsFromTypes));
}

/**
 * When physical room keys exist, the floor plan must match **inventory** so we can write
 * `hotel.room_units.floor` from the plan. Otherwise it follows catalog / registration totals.
 */
export function getFloorPlanEffectiveTarget(
  catalogRoomTarget: number,
  roomUnitInventoryCount: number,
): number {
  if (roomUnitInventoryCount > 0) return roomUnitInventoryCount;
  return Math.max(0, Math.trunc(catalogRoomTarget));
}

/**
 * When there are no rooms to place, floor plan is not required.
 * An empty plan means every room is treated as ground floor (floor 1) implicitly.
 * If the hotel adds explicit rows, their room counts must sum to `targetRoomCount`.
 */
export function isFloorPlanComplete(plan: HotelFloorPlanEntry[], targetRoomCount: number): boolean {
  if (targetRoomCount <= 0) return true;
  if (plan.length === 0) return true;
  return getFloorPlanRoomTotal(plan) === targetRoomCount;
}

/** Distinct levels in the saved plan; empty plan counts as one (ground) level. */
export function getFloorPlanLevelCount(plan: HotelFloorPlanEntry[]): number {
  return plan.length > 0 ? plan.length : 1;
}
