/*
 * Dates and messages shared by the reservation screens and routes. Safe for the browser and the
 * server. Front desk dates are wall-clock days (stored as UTC), so everything here works in UTC.
 */

export const DAY_MS = 86_400_000;

export function isDay(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole nights from arrival to departure (departure day not counted). Never below zero. */
export function nightsBetweenDays(arrival: string, departure: string): number {
  const a = new Date(`${arrival}T12:00:00.000Z`).getTime();
  const d = new Date(`${departure}T12:00:00.000Z`).getTime();
  return Math.max(0, Math.round((d - a) / DAY_MS));
}

/** Every night of a stay: arrival day up to the day before departure. */
export function nightsOf(arrival: string, departure: string): string[] {
  const count = nightsBetweenDays(arrival, departure);
  return Array.from({ length: count }, (_, i) => addDays(arrival, i));
}

/** The date part of a stored time (front desk times are wall-clock stored as UTC). */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** The time part, as HH:MM. */
export function timeOf(iso: string): string {
  return iso.slice(11, 16);
}

export function formatDayShort(day: string): string {
  return new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatDayLong(day: string): string {
  return new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** A database refusal turned into words staff can act on, or null when it is some other error. */
export function friendlyReservationError(message: string | null | undefined): { text: string; kind: "room_taken" | "type_full" } | null {
  if (!message) return null;
  if (message.includes("ROOM_DOUBLE_BOOKED")) {
    const m = message.match(/already booked by ([A-Za-z0-9-]+) from (\d{1,2} \w{3}) to (\d{1,2} \w{3})/);
    return {
      kind: "room_taken",
      text: m ? `That room is already booked by ${m[1]} from ${m[2]} to ${m[3]}.` : "That room is already booked for some of those nights.",
    };
  }
  if (message.includes("ROOM_TYPE_FULL")) {
    const m = message.match(/left on (\d{1,2} \w{3})/);
    return {
      kind: "type_full",
      text: m ? `No room of that type is left on ${m[1]}. A manager can override the limit.` : "No room of that type is left for those nights. A manager can override the limit.",
    };
  }
  return null;
}

export type NightCount = { night: string; stock: number; overbook: number; sold: number; held: number };

/** Rooms still free to sell on one night, with and without the overbooking allowance. */
export function freeOnNight(n: NightCount) {
  const free = n.stock - n.sold - n.held;
  return { free, freeWithAllowance: free + n.overbook, overbooked: free < 0 };
}

export type TypeAvailability = {
  roomTypeCode: string;
  roomTypeName: string;
  stock: number;
  overbook: number;
  /** The fewest rooms free on any night of the stay (can be negative when sold past stock). */
  minFree: number;
  /** The same, counting the overbooking allowance. */
  minFreeWithAllowance: number;
  nights: (NightCount & { free: number })[];
};

export function summariseAvailability(code: string, name: string, nights: NightCount[]): TypeAvailability {
  const rows = nights.map((n) => ({ ...n, free: freeOnNight(n).free }));
  const minFree = rows.length ? Math.min(...rows.map((r) => r.free)) : 0;
  const overbook = rows.length ? rows[0].overbook : 0;
  return {
    roomTypeCode: code,
    roomTypeName: name,
    stock: rows.length ? Math.max(...rows.map((r) => r.stock)) : 0,
    overbook,
    minFree,
    minFreeWithAllowance: minFree + overbook,
    nights: rows,
  };
}
