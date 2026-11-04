/*
 * Date helpers for the reports. Stays are stored as wall-clock times written as UTC (a 14:00 arrival
 * is 14:00Z), so a stay's date is the first ten characters of its timestamp. Things that happened at
 * a real moment (a payment, a closed F&B bill) are turned into the hotel's own calendar date.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/** Every date from `from` to `to`, both included. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 3700; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The hotel's calendar date for a real moment. */
export function hotelDate(instant: string | Date, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** The date a wall-clock-as-UTC timestamp falls on. */
export function stayDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** The UTC instants where a hotel-local day starts, so a folio query can be limited to a range of dates. */
export function hotelDayStart(date: string, timeZone: string): string {
  const guess = new Date(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const offset = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

/** The same calendar date one year earlier (29 February becomes 28 February). */
export function yearAgo(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y - 1, m - 1, d));
  if (target.getUTCMonth() !== m - 1) return new Date(Date.UTC(y - 1, m, 0)).toISOString().slice(0, 10);
  return target.toISOString().slice(0, 10);
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function yearStart(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}

export function daysInMonth(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function formatLongDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatShortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Monday of the week a date falls in. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
