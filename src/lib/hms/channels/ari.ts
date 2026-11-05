import type { AriUpdate } from "./types";

/*
 * Availability, rates and restrictions ("ARI") as plain data: what we want the channel to show, the
 * fingerprint of what it was last told, and the smallest set of updates that closes the gap.
 * No database, no provider. Safe for the browser and the server.
 */

export type AvailCell = { roomTypeCode: string; date: string; availability: number };
export type RateCell = {
  roomTypeCode: string;
  planCode: string;
  date: string;
  rate: number;
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  minStay: number | null;
  maxStay: number | null;
};

export const availRef = (c: { roomTypeCode: string }) => c.roomTypeCode;
export const rateRef = (c: { roomTypeCode: string; planCode: string }) => `${c.roomTypeCode}|${c.planCode}`;

export const availFingerprint = (c: AvailCell) => `a${Math.max(0, Math.floor(c.availability))}`;
export const rateFingerprint = (c: RateCell) =>
  `r${c.rate.toFixed(2)}|${c.stopSell ? 1 : 0}${c.closedToArrival ? 1 : 0}${c.closedToDeparture ? 1 : 0}|${c.minStay ?? ""}|${c.maxStay ?? ""}`;

/** Rooms the channels may see: what is really free, held back by the cap the hotel chose. */
export function channelAvailability(free: number, cap: number | null | undefined): number {
  const f = Math.max(0, Math.floor(free));
  return cap === null || cap === undefined ? f : Math.min(f, Math.max(0, Math.floor(cap)));
}

export type SentKey = `${"availability" | "rate"}|${string}|${string}`;
export const sentKey = (kind: "availability" | "rate", ref: string, day: string): SentKey => `${kind}|${ref}|${day}`;

export function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type Range<T> = { ref: string; from: string; to: string; fingerprint: string; first: T };

/** Joins consecutive nights with the same value into one range, so a half-year change is one value, not 180. */
export function toRanges<T extends { date: string }>(cells: T[], refOf: (c: T) => string, fpOf: (c: T) => string): Range<T>[] {
  const sorted = [...cells].sort((a, b) => (refOf(a) === refOf(b) ? a.date.localeCompare(b.date) : refOf(a).localeCompare(refOf(b))));
  const out: Range<T>[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    const ref = refOf(c);
    const fp = fpOf(c);
    if (last && last.ref === ref && last.fingerprint === fp && addDaysIso(last.to, 1) === c.date) last.to = c.date;
    else out.push({ ref, from: c.date, to: c.date, fingerprint: fp, first: c });
  }
  return out;
}

/** Cells whose fingerprint differs from what the channel was last told. `full` sends everything. */
export function changedCells<T extends { date: string }>(
  cells: T[],
  kind: "availability" | "rate",
  refOf: (c: T) => string,
  fpOf: (c: T) => string,
  sent: Map<SentKey, string>,
  full: boolean,
): T[] {
  return full ? cells : cells.filter((c) => sent.get(sentKey(kind, refOf(c), c.date)) !== fpOf(c));
}

export type StateRange = { kind: "availability" | "rate"; ref: string; from: string; to: string; fingerprint: string };

export type Planned = { updates: AriUpdate[]; state: StateRange[] };

export type ExternalIds = {
  roomType: (roomTypeCode: string) => string | undefined;
  ratePlan: (roomTypeCode: string, planCode: string) => string | undefined;
};

/** The updates (and the state to record once they are accepted) for the cells that changed. */
export function planUpdates(avail: AvailCell[], rates: RateCell[], ids: ExternalIds): Planned {
  const updates: AriUpdate[] = [];
  const state: StateRange[] = [];
  for (const r of toRanges(avail, availRef, availFingerprint)) {
    const ext = ids.roomType(r.first.roomTypeCode);
    if (!ext) continue;
    updates.push({ kind: "availability", externalRoomTypeId: ext, dateFrom: r.from, dateTo: r.to, availability: r.first.availability });
    state.push({ kind: "availability", ref: r.ref, from: r.from, to: r.to, fingerprint: r.fingerprint });
  }
  for (const r of toRanges(rates, rateRef, rateFingerprint)) {
    const c = r.first;
    const ext = ids.ratePlan(c.roomTypeCode, c.planCode);
    if (!ext) continue;
    updates.push({
      kind: "rate",
      externalRatePlanId: ext,
      dateFrom: r.from,
      dateTo: r.to,
      rate: c.rate,
      stopSell: c.stopSell,
      closedToArrival: c.closedToArrival,
      closedToDeparture: c.closedToDeparture,
      minStay: c.minStay,
      maxStay: c.maxStay,
    });
    state.push({ kind: "rate", ref: r.ref, from: r.from, to: r.to, fingerprint: r.fingerprint });
  }
  return { updates, state };
}

/** Splits a long list into calls of at most `size` values (the provider takes a few hundred at a time). */
export function chunkPlanned(p: Planned, size: number): Planned[] {
  const out: Planned[] = [];
  // updates and state were built in the same order and have the same length
  for (let i = 0; i < p.updates.length; i += size) {
    out.push({ updates: p.updates.slice(i, i + size), state: p.state.slice(i, i + size) });
  }
  return out;
}

/** Merges the changed nights read from the database into the smallest set of ranges per room type. */
export type DirtyRow = { room_type_code: string | null; date_from: string; date_to: string };
export function mergeDirty(rows: DirtyRow[], allTypes: string[], today: string, horizonDays: number): { roomTypeCode: string; from: string; to: string }[] {
  const lastDay = addDaysIso(today, horizonDays - 1);
  const byType = new Map<string, { from: string; to: string }[]>();
  for (const r of rows) {
    const types = r.room_type_code ? (allTypes.includes(r.room_type_code) ? [r.room_type_code] : []) : allTypes;
    const from = r.date_from < today ? today : r.date_from;
    const to = r.date_to > lastDay ? lastDay : r.date_to;
    if (to < from) continue;
    for (const t of types) byType.set(t, [...(byType.get(t) ?? []), { from, to }]);
  }
  const out: { roomTypeCode: string; from: string; to: string }[] = [];
  for (const [t, list] of byType) {
    list.sort((a, b) => a.from.localeCompare(b.from));
    let cur = { ...list[0] };
    for (const r of list.slice(1)) {
      if (r.from <= addDaysIso(cur.to, 1)) cur.to = r.to > cur.to ? r.to : cur.to;
      else {
        out.push({ roomTypeCode: t, ...cur });
        cur = { ...r };
      }
    }
    out.push({ roomTypeCode: t, ...cur });
  }
  return out;
}

/** Seconds to wait before trying a failed call again: 30 s, 1 min, 2 min… up to an hour. */
export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}
