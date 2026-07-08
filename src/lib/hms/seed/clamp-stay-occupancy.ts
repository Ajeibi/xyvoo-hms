import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";

export function maxOccupancyByRoomTypeId(roomTypes: HotelRoomTypeSetup[]): Map<string, number> {
  return new Map(roomTypes.map((rt) => [rt.id, rt.maxOccupancy]));
}

export function resolveMaxOccupancy(
  roomTypeCode: string,
  occupancyByType: Map<string, number>,
  fallback = 2,
): number {
  return occupancyByType.get(roomTypeCode) ?? fallback;
}

/** Clamp adults + children to room type max (children removed first, then adults). */
export function clampStayOccupancy(
  adults: number,
  children: { age: number }[],
  maxOccupancy: number,
): { adults: number; children: { age: number }[] } {
  let a = Math.max(1, adults);
  let c = [...children];

  while (a + c.length > maxOccupancy) {
    if (c.length > 0) {
      c.pop();
      continue;
    }
    if (a > maxOccupancy) {
      a = Math.max(1, maxOccupancy);
      continue;
    }
    break;
  }

  return { adults: a, children: c };
}

export function stayHeadcount(adults: number, children: { age: number }[] | undefined): number {
  return Math.max(0, adults) + (children?.length ?? 0);
}
