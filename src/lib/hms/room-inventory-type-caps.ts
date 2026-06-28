import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";

export type InventoryUnitForCaps = {
  id: string;
  room_type_code: string;
};

/** Count physical keys per configured room type id (unknown types are ignored). */
export function countInventoryByRoomTypeId(
  units: InventoryUnitForCaps[],
  validTypeIds: Set<string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of units) {
    const typeId = u.room_type_code;
    if (!validTypeIds.has(typeId)) continue;
    counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  }
  return counts;
}

/** Simulate assignment updates and return projected counts per type id. */
export function projectCountsAfterUpdates(
  units: InventoryUnitForCaps[],
  validTypeIds: Set<string>,
  updates: Map<string, string>,
): Map<string, number> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const counts = countInventoryByRoomTypeId(units, validTypeIds);

  for (const [unitId, newTypeId] of updates) {
    if (!validTypeIds.has(newTypeId)) continue;
    const unit = byId.get(unitId);
    if (!unit) continue;

    const oldTypeId = unit.room_type_code;
    if (oldTypeId === newTypeId) continue;

    if (validTypeIds.has(oldTypeId)) {
      const prev = counts.get(oldTypeId) ?? 0;
      if (prev > 0) counts.set(oldTypeId, prev - 1);
    }
    counts.set(newTypeId, (counts.get(newTypeId) ?? 0) + 1);
  }

  return counts;
}

export function findCapacityViolation(
  roomTypes: Pick<HotelRoomTypeSetup, "id" | "name" | "rooms">[],
  counts: Map<string, number>,
): string | null {
  for (const rt of roomTypes) {
    const assigned = counts.get(rt.id) ?? 0;
    if (assigned > rt.rooms) {
      return `${rt.name} allows ${rt.rooms} room key(s); this would assign ${assigned}. Reassign or remove keys, or increase the type count above.`;
    }
  }
  return null;
}

export function validateInventoryTypeUpdates(
  roomTypes: Pick<HotelRoomTypeSetup, "id" | "name" | "rooms">[],
  units: InventoryUnitForCaps[],
  updates: Map<string, string>,
): { ok: true } | { ok: false; error: string } {
  const validTypeIds = new Set(roomTypes.map((r) => r.id));
  const projected = projectCountsAfterUpdates(units, validTypeIds, updates);
  const violation = findCapacityViolation(roomTypes, projected);
  if (violation) return { ok: false, error: violation };
  return { ok: true };
}

/** Ensure current inventory does not exceed caps (e.g. when lowering type counts on save). */
export function validateCurrentInventoryAgainstCaps(
  roomTypes: Pick<HotelRoomTypeSetup, "id" | "name" | "rooms">[],
  units: InventoryUnitForCaps[],
): { ok: true } | { ok: false; error: string } {
  const validTypeIds = new Set(roomTypes.map((r) => r.id));
  const counts = countInventoryByRoomTypeId(units, validTypeIds);
  const violation = findCapacityViolation(roomTypes, counts);
  if (violation) return { ok: false, error: violation };
  return { ok: true };
}

/** Numeric sort key for room_code (101, 10 from 10A, null if no digits). */
export function numericRoomKey(roomCode: string): number | null {
  const t = String(roomCode).trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function buildUpdatesFromRange(
  units: Array<{ id: string; room_code: string }>,
  from: number,
  to: number,
  roomTypeId: string,
): Map<string, string> {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const updates = new Map<string, string>();
  for (const u of units) {
    const n = numericRoomKey(u.room_code);
    if (n == null) continue;
    if (n >= lo && n <= hi) updates.set(u.id, roomTypeId);
  }
  return updates;
}
