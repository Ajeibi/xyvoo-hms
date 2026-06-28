import type { RoomDetailPayload } from "@/lib/hms/rooms-workbench";

const TTL_MS = 30_000;
const cache = new Map<string, { data: RoomDetailPayload; ts: number }>();

export function getCachedRoomDetail(roomUnitId: string): RoomDetailPayload | null {
  const hit = cache.get(roomUnitId);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    cache.delete(roomUnitId);
    return null;
  }
  return hit.data;
}

export function setCachedRoomDetail(roomUnitId: string, data: RoomDetailPayload): void {
  cache.set(roomUnitId, { data, ts: Date.now() });
}

export function invalidateRoomDetail(roomUnitId: string): void {
  cache.delete(roomUnitId);
}
