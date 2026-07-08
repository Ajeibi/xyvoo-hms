/** Firefly Pope JPII room type ids (from tenant room_types). */

export const FIREFLY_ROOM_TYPE_IDS = {
  standard: "3395f8e0-a192-4048-801a-fd28114b0bdd",
  superStandard: "e957016a-5bfe-4822-aad1-d06926850cc2",
  queen: "9c7846c8-f51f-4013-8e09-bfab4a202429",
  king: "bd94f32a-0d1b-498d-b020-97440a375571",
  suite: "246f11af-e886-421b-a3c4-dec34e46b8be",
} as const;

export type FireflyRoomUnit = {
  room_code: string;
  floor: number;
  room_type_code: string;
};

/** Authoritative firefly physical keys (71) — matches live hotel.room_units. */
export const FIREFLY_ROOM_UNITS: FireflyRoomUnit[] = [
  { room_code: "50", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "51", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "52", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "53", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "54", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "55", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "56", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "57", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "58", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "59", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "60", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "61", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "62", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "63", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.standard },
  { room_code: "64", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "65", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "66", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "67", floor: 1, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "100", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "101", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "102", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "103", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "104", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "105", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "106", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "107", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "108", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "109", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "110", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "111", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "112", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "113", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.superStandard },
  { room_code: "114", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "115", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "116", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "117", floor: 2, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "150", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "151", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "152", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "153", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "154", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "155", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "156", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.queen },
  { room_code: "157", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "158", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "159", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "160", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "161", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "162", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "163", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "164", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "165", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "166", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "167", floor: 3, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "200", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "201", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "202", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "203", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "204", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.king },
  { room_code: "205", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "206", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "207", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "208", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "209", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "210", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "211", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "212", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "213", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "214", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "215", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
  { room_code: "216", floor: 4, room_type_code: FIREFLY_ROOM_TYPE_IDS.suite },
];

export const FIREFLY_ROOM_CODES = new Set(FIREFLY_ROOM_UNITS.map((u) => u.room_code));

const roomByCode = new Map(FIREFLY_ROOM_UNITS.map((u) => [u.room_code, u]));

/** Default max occupancy for firefly fixtures when tenant config is unavailable offline. */
export const FIREFLY_MAX_OCCUPANCY: Record<string, number> = {
  [FIREFLY_ROOM_TYPE_IDS.standard]: 1,
  [FIREFLY_ROOM_TYPE_IDS.superStandard]: 2,
  [FIREFLY_ROOM_TYPE_IDS.queen]: 2,
  [FIREFLY_ROOM_TYPE_IDS.king]: 2,
  [FIREFLY_ROOM_TYPE_IDS.suite]: 2,
};

export function fireflyRoomUnit(roomCode: string): FireflyRoomUnit | null {
  return roomByCode.get(roomCode) ?? null;
}

export function fireflyRoomCodeToTypeId(roomCode: string): string | null {
  return roomByCode.get(roomCode)?.room_type_code ?? null;
}

export function fireflyMaxOccupancyForRoomCode(roomCode: string): number {
  const typeId = fireflyRoomCodeToTypeId(roomCode);
  if (!typeId) return 2;
  return FIREFLY_MAX_OCCUPANCY[typeId] ?? 2;
}

export function isFireflyRoomCode(roomCode: string): boolean {
  return FIREFLY_ROOM_CODES.has(roomCode);
}
