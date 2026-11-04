import { isBookedStayLine, stayLinePart } from "@/lib/hms/folio";
import { addDays, eachDate, stayDate } from "@/lib/hms/reports/dates";

/*
 * The hotel's numbers, worked out one way for the dashboard, the reports and the emails.
 *
 * - Rooms sold on a night: stays that hold the room that night. In-house and checked-out stays count
 *   for any night they covered; a confirmed stay counts for tonight and later (earlier, it never came).
 * - Room revenue: the stay's room charge (after any booking discount, before tax) shared evenly over
 *   its nights. The folio posts the whole stay at check-in, so posting dates would pile a week of room
 *   revenue onto one day; this puts each night's revenue on the night it belongs to.
 * - ADR = room revenue / rooms sold. RevPAR = room revenue / rooms available. Occupancy = sold / available.
 * - Rooms available: every room in the inventory, less rooms out of order now for tonight and later nights
 *   (the dates a room was out of order are not kept, so past nights keep every room).
 * - Revenue for other departments comes from the bill lines and walk-in F&B sales on the day they were posted.
 */

export type StayRow = {
  id: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  total_room_charges: number | string | null;
  created_at: string;
  /** The room type's id from the hotel's room setup. */
  room_type_code?: string | null;
};

export type FolioRevenueLine = {
  kind: string;
  amount: number | string;
  department: string | null;
  method: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  reference?: string | null;
  description?: string | null;
};

export type WalkInFbOrder = { subtotal: number | string; closed_at: string | null };

export type DayFigures = {
  date: string;
  roomsAvailable: number;
  roomsSold: number;
  /** Room rate revenue: nights sold at the booked rate. Drives ADR and RevPAR. */
  roomRateRevenue: number;
  /** Rooms-department lines posted that day apart from the booked stay (extra nights, fees, credits). */
  roomsAdjustments: number;
  fbRevenue: number;
  otherRevenue: number;
  unclassifiedRevenue: number;
};

export type PeriodFigures = {
  from: string;
  to: string;
  days: number;
  roomsAvailable: number;
  roomsSold: number;
  roomRateRevenue: number;
  roomsRevenue: number;
  fbRevenue: number;
  otherRevenue: number;
  unclassifiedRevenue: number;
  totalRevenue: number;
  /** Percent; null when there were no rooms. */
  occupancy: number | null;
  /** Null when no room was sold. */
  adr: number | null;
  revpar: number | null;
};

const GOVERNMENT_TAX_PARTS = new Set(["vat", "state_levy", "stamp_levy"]);

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Nights a stay covers as dates: the arrival date up to, not including, the departure date. */
export function stayNightDates(stay: Pick<StayRow, "arrival_at" | "departure_at">): string[] {
  const from = stayDate(stay.arrival_at);
  const to = stayDate(stay.departure_at);
  const out: string[] = [];
  for (let d = from; d < to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Whether a stay holds its room on `night` (see the notes at the top). */
export function holdsRoom(status: string, night: string, today: string): boolean {
  if (status === "checked_in" || status === "checked_out") return true;
  if (status === "confirmed") return night >= today;
  return false;
}

/** Rooms sold and room-rate revenue for each night in a list of dates. */
export function nightsSold(stays: StayRow[], dates: string[], today: string): Map<string, { sold: number; revenue: number }> {
  const wanted = new Set(dates);
  const out = new Map<string, { sold: number; revenue: number }>(dates.map((d) => [d, { sold: 0, revenue: 0 }]));
  for (const stay of stays) {
    const nights = stayNightDates(stay);
    if (nights.length === 0) continue;
    const perNight = num(stay.total_room_charges) / nights.length;
    for (const night of nights) {
      if (!wanted.has(night) || !holdsRoom(stay.status, night, today)) continue;
      const row = out.get(night)!;
      row.sold += 1;
      row.revenue += perNight;
    }
  }
  return out;
}

type Split = { rooms: number; fb: number; other: number; unclassified: number };

/** Adds a folio line to one day's other-department figures. Booked-stay lines and government taxes are left out. */
function addFolioLine(line: FolioRevenueLine, into: Split): void {
  if (line.kind !== "charge" && line.kind !== "discount") return;
  const sign = line.kind === "charge" ? 1 : -1;
  const amount = Math.abs(num(line.amount));
  const allocation = line.metadata?.allocation;
  if (line.kind === "discount" && Array.isArray(allocation) && allocation.length > 0) {
    for (const a of allocation as { department: string | null; amount: number }[]) {
      const share = Math.abs(num(a.amount));
      if (a.department === "rooms") into.rooms -= share;
      else if (a.department === "food_beverage") into.fb -= share;
      else if (a.department) into.other -= share;
      else into.unclassified -= share;
    }
    return;
  }
  const asRow = { metadata: line.metadata ?? {}, reference: line.reference ?? null, description: line.description ?? null };
  if (line.department === "rooms") {
    const part = stayLinePart(asRow);
    if (GOVERNMENT_TAX_PARTS.has(part)) return;
    // The booked stay's room line is spread over its nights instead; its service charge is the hotel's other income.
    if (isBookedStayLine({ ...asRow, kind: line.kind as "charge", department: line.department, method: line.method })) {
      if (part === "room") return;
      into.other += sign * amount;
      return;
    }
    into.rooms += sign * amount;
  } else if (line.department === "food_beverage") into.fb += sign * amount;
  else if (line.department) into.other += sign * amount;
  else into.unclassified += sign * amount;
}

export type DayBucketer = (instant: string) => string;

/** Other-department revenue per hotel date from bill lines and walk-in F&B sales. */
export function postedRevenueByDate(folio: FolioRevenueLine[], walkIn: WalkInFbOrder[], dateOf: DayBucketer): Map<string, Split> {
  const out = new Map<string, Split>();
  const at = (d: string) => {
    let s = out.get(d);
    if (!s) {
      s = { rooms: 0, fb: 0, other: 0, unclassified: 0 };
      out.set(d, s);
    }
    return s;
  };
  for (const line of folio) addFolioLine(line, at(dateOf(line.created_at)));
  for (const o of walkIn) if (o.closed_at) at(dateOf(o.closed_at)).fb += num(o.subtotal);
  return out;
}

/**
 * Rooms available on a night. A room that is out of order now is taken off tonight and later nights;
 * past nights keep every room, because the dates a room was out of order are not kept.
 */
export function roomsAvailableOn(date: string, today: string, roomCount: number, outOfOrder = 0): number {
  return Math.max(0, roomCount - (date >= today ? outOfOrder : 0));
}

export function buildDaySeries(params: {
  dates: string[];
  roomCount: number;
  /** Rooms out of order now. */
  outOfOrder?: number;
  stays: StayRow[];
  folio: FolioRevenueLine[];
  walkIn: WalkInFbOrder[];
  today: string;
  dateOf: DayBucketer;
}): DayFigures[] {
  const sold = nightsSold(params.stays, params.dates, params.today);
  const posted = postedRevenueByDate(params.folio, params.walkIn, params.dateOf);
  return params.dates.map((date) => {
    const s = sold.get(date) ?? { sold: 0, revenue: 0 };
    const p = posted.get(date) ?? { rooms: 0, fb: 0, other: 0, unclassified: 0 };
    return {
      date,
      roomsAvailable: roomsAvailableOn(date, params.today, params.roomCount, params.outOfOrder),
      roomsSold: s.sold,
      roomRateRevenue: round2(s.revenue),
      roomsAdjustments: round2(p.rooms),
      fbRevenue: round2(p.fb),
      otherRevenue: round2(p.other),
      unclassifiedRevenue: round2(p.unclassified),
    };
  });
}

export function sumPeriod(series: DayFigures[], from: string, to: string): PeriodFigures {
  const days = series.filter((d) => d.date >= from && d.date <= to);
  const sum = (pick: (d: DayFigures) => number) => round2(days.reduce((s, d) => s + pick(d), 0));
  const roomsAvailable = days.reduce((s, d) => s + d.roomsAvailable, 0);
  const roomsSold = days.reduce((s, d) => s + d.roomsSold, 0);
  const roomRateRevenue = sum((d) => d.roomRateRevenue);
  const roomsRevenue = round2(roomRateRevenue + sum((d) => d.roomsAdjustments));
  const fbRevenue = sum((d) => d.fbRevenue);
  const otherRevenue = sum((d) => d.otherRevenue);
  const unclassifiedRevenue = sum((d) => d.unclassifiedRevenue);
  return {
    from,
    to,
    days: days.length,
    roomsAvailable,
    roomsSold,
    roomRateRevenue,
    roomsRevenue,
    fbRevenue,
    otherRevenue,
    unclassifiedRevenue,
    totalRevenue: round2(roomsRevenue + fbRevenue + otherRevenue + unclassifiedRevenue),
    occupancy: roomsAvailable > 0 ? Math.round((roomsSold / roomsAvailable) * 1000) / 10 : null,
    adr: roomsSold > 0 ? round2(roomRateRevenue / roomsSold) : null,
    revpar: roomsAvailable > 0 ? round2(roomRateRevenue / roomsAvailable) : null,
  };
}

/** Change from `then` to `now` as a percent of `then`; null when there is nothing to compare with. */
export function percentChange(now: number | null, then: number | null): number | null {
  if (now == null || then == null || then === 0) return null;
  return Math.round(((now - then) / Math.abs(then)) * 1000) / 10;
}

/** A yearly or monthly budget spread over days: each day of a month gets 1/days of that month's budget. */
export function proratedBudget(monthly: Map<string, number>, from: string, to: string): number {
  let total = 0;
  for (const date of eachDate(from, to)) {
    const month = `${date.slice(0, 7)}-01`;
    const amount = monthly.get(month);
    if (!amount) continue;
    const y = Number(date.slice(0, 4));
    const m = Number(date.slice(5, 7));
    total += amount / new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  return round2(total);
}
