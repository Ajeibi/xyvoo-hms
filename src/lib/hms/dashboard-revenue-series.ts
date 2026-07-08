import type {
  FinanceMetric,
  FinancePeriod,
  FinancialTrendViews,
} from "@/components/hms/dashboard/analytics/dashboard-analytics-types";
import { fbPosRevenueForUtcDay, type DashboardFbOrderRow } from "@/lib/hms/dashboard-fb-metrics";

export type FolioRevenueRow = {
  reservation_id: string;
  kind: string;
  amount: string | number;
  voided_at: string | null;
  created_at: string;
};

type ReservationRevenueRow = {
  status: string;
  arrival_at: string;
  departure_at: string;
  rate_per_night: string | number;
};

function utcDayRangeIso(reference = new Date()) {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const next = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), nextIso: next.toISOString(), startMs: start.getTime(), nextMs: next.getTime() };
}

function parseTs(value: string) {
  return new Date(value).getTime();
}

function num(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function inUtcDay(value: string, reference = new Date()) {
  const t = parseTs(value);
  const { startMs, nextMs } = utcDayRangeIso(reference);
  return t >= startMs && t < nextMs;
}

/** Daily gross revenue from folio charges and payments (UTC). */
export function computeGrossRevenueForUtcDay(
  transactions: FolioRevenueRow[],
  reference = new Date(),
): number {
  let fromCharges = 0;
  let fromPayments = 0;
  const chargesByReservation = new Map<string, number>();
  const paymentsByReservation = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.voided_at) continue;
    if (!inUtcDay(tx.created_at, reference)) continue;

    const reservationId = tx.reservation_id;
    const amount = num(tx.amount);

    if (tx.kind === "charge") {
      fromCharges += amount;
      chargesByReservation.set(reservationId, (chargesByReservation.get(reservationId) ?? 0) + amount);
    } else if (tx.kind === "payment") {
      const payment = Math.abs(amount);
      fromPayments += payment;
      paymentsByReservation.set(reservationId, (paymentsByReservation.get(reservationId) ?? 0) + payment);
    }
  }

  let sameDayOverlap = 0;
  for (const [reservationId, chargeTotal] of chargesByReservation) {
    const paymentTotal = paymentsByReservation.get(reservationId) ?? 0;
    sameDayOverlap += Math.min(chargeTotal, paymentTotal);
  }

  return Math.round((fromCharges + fromPayments - sameDayOverlap) * 100) / 100;
}

/** Folio activity + PoS counter collections for one UTC day. */
export function getGrossRevenueForUtcDay(
  folioRows: FolioRevenueRow[],
  fbOrders: DashboardFbOrderRow[],
  reference = new Date(),
): number {
  const folio = computeGrossRevenueForUtcDay(folioRows, reference);
  const pos = fbPosRevenueForUtcDay(fbOrders, reference);
  return Math.round((folio + pos) * 100) / 100;
}

/** @deprecated Use {@link getGrossRevenueForUtcDay} */
export const grossRevenueForUtcDay = getGrossRevenueForUtcDay;

function revenueInHourWindow(
  folioRows: FolioRevenueRow[],
  fbOrders: DashboardFbOrderRow[],
  day: Date,
  startHour: number,
  endHour: number,
) {
  const { startMs, nextMs } = utcDayRangeIso(day);
  let total = 0;

  for (const tx of folioRows) {
    if (tx.voided_at) continue;
    const t = parseTs(tx.created_at);
    if (t < startMs || t >= nextMs) continue;
    const h = new Date(t).getUTCHours();
    if (h < startHour || h >= endHour) continue;
    if (tx.kind === "charge") total += num(tx.amount);
    else if (tx.kind === "payment") total += Math.abs(num(tx.amount));
  }

  for (const order of fbOrders) {
    if (order.status !== "closed" || !order.closed_at) continue;
    const t = parseTs(order.closed_at);
    if (t < startMs || t >= nextMs) continue;
    const h = new Date(t).getUTCHours();
    if (h < startHour || h >= endHour) continue;
    const method = order.settlement_method;
    if (method === "pos" || method === "cash" || method === "card") {
      total += num(order.subtotal);
    }
  }

  return Math.round(total * 100) / 100;
}

function occupancyForUtcDay(
  reservations: ReservationRevenueRow[],
  totalRooms: number,
  reference: Date,
): number {
  const safeRooms = Math.max(totalRooms, 1);
  const { startMs, nextMs } = utcDayRangeIso(reference);
  let occupied = 0;

  for (const r of reservations) {
    if (r.status === "cancelled" || r.status === "no_show") continue;
    const a = parseTs(r.arrival_at);
    const dep = parseTs(r.departure_at);
    if (dep > startMs && a < nextMs) occupied += 1;
  }

  return Math.min(100, Math.round((occupied / safeRooms) * 100));
}

function adrForUtcDay(reservations: ReservationRevenueRow[], reference: Date): number {
  const { startMs, nextMs } = utcDayRangeIso(reference);
  const rates: number[] = [];

  for (const r of reservations) {
    if (r.status === "cancelled" || r.status === "no_show") continue;
    const a = parseTs(r.arrival_at);
    const dep = parseTs(r.departure_at);
    if (dep > startMs && a < nextMs) rates.push(num(r.rate_per_night));
  }

  if (!rates.length) return 0;
  return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
}

function revParForDay(adr: number, occupancyPct: number) {
  return Math.round((adr * occupancyPct) / 100);
}

function zeroMetrics(length: number): Record<FinanceMetric, number[]> {
  const zeros = Array.from({ length }, () => 0);
  return {
    revenue: [...zeros],
    occupancy: [...zeros],
    adr: [...zeros],
    revpar: [...zeros],
    expenses: [...zeros],
    profit: [...zeros],
  };
}

export function buildFinancialTrendViews(params: {
  folioRows: FolioRevenueRow[];
  fbOrders: DashboardFbOrderRow[];
  reservations: ReservationRevenueRow[];
  totalRooms: number;
  reference?: Date;
}): FinancialTrendViews {
  const { folioRows, fbOrders, reservations, totalRooms } = params;
  const now = params.reference ?? new Date();
  const safeRooms = Math.max(totalRooms, 1);

  const dayBuckets = [
    { label: "06:00", start: 0, end: 6 },
    { label: "09:00", start: 6, end: 9 },
    { label: "12:00", start: 9, end: 12 },
    { label: "15:00", start: 12, end: 15 },
    { label: "18:00", start: 15, end: 18 },
    { label: "21:00", start: 18, end: 24 },
  ];

  const dayRevenue = dayBuckets.map((b) =>
    revenueInHourWindow(folioRows, fbOrders, now, b.start, b.end),
  );
  const dayOccupancy = dayBuckets.map(() => occupancyForUtcDay(reservations, safeRooms, now));
  const dayAdr = dayBuckets.map(() => adrForUtcDay(reservations, now));
  const dayRevpar = dayOccupancy.map((occ, i) => revParForDay(dayAdr[i] ?? 0, occ));

  const weekLabels: string[] = [];
  const weekRevenue: number[] = [];
  const weekOccupancy: number[] = [];
  const weekAdr: number[] = [];
  const weekRevpar: number[] = [];

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    weekLabels.push(
      d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
    );
    weekRevenue.push(grossRevenueForUtcDay(folioRows, fbOrders, d));
    const occ = occupancyForUtcDay(reservations, safeRooms, d);
    const adr = adrForUtcDay(reservations, d);
    weekOccupancy.push(occ);
    weekAdr.push(adr);
    weekRevpar.push(revParForDay(adr, occ));
  }

  const monthLabels = ["Week 1", "Week 2", "Week 3", "Week 4"];
  const monthRevenue: number[] = [];
  const monthOccupancy: number[] = [];
  const monthAdr: number[] = [];
  const monthRevpar: number[] = [];

  for (let w = 3; w >= 0; w -= 1) {
    let rev = 0;
    const occSamples: number[] = [];
    const adrSamples: number[] = [];
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - w * 7 - d),
      );
      rev += grossRevenueForUtcDay(folioRows, fbOrders, day);
      occSamples.push(occupancyForUtcDay(reservations, safeRooms, day));
      adrSamples.push(adrForUtcDay(reservations, day));
    }
    monthRevenue.push(Math.round(rev * 100) / 100);
    const occAvg = occSamples.length
      ? Math.round(occSamples.reduce((a, b) => a + b, 0) / occSamples.length)
      : 0;
    const adrAvg = adrSamples.length
      ? Math.round(adrSamples.reduce((a, b) => a + b, 0) / adrSamples.length)
      : 0;
    monthOccupancy.push(occAvg);
    monthAdr.push(adrAvg);
    monthRevpar.push(revParForDay(adrAvg, occAvg));
  }

  const quarterLabels: string[] = [];
  const quarterRevenue: number[] = [];
  const quarterOccupancy: number[] = [];
  const quarterAdr: number[] = [];
  const quarterRevpar: number[] = [];

  for (let m = 2; m >= 0; m -= 1) {
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    quarterLabels.push(
      anchor.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    );
    let rev = 0;
    const occSamples: number[] = [];
    const adrSamples: number[] = [];
    const y = anchor.getUTCFullYear();
    const mo = anchor.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(Date.UTC(y, mo, day));
      if (d.getTime() > now.getTime()) break;
      rev += grossRevenueForUtcDay(folioRows, fbOrders, d);
      occSamples.push(occupancyForUtcDay(reservations, safeRooms, d));
      adrSamples.push(adrForUtcDay(reservations, d));
    }
    quarterRevenue.push(Math.round(rev * 100) / 100);
    const occAvg = occSamples.length
      ? Math.round(occSamples.reduce((a, b) => a + b, 0) / occSamples.length)
      : 0;
    const adrAvg = adrSamples.length
      ? Math.round(adrSamples.reduce((a, b) => a + b, 0) / adrSamples.length)
      : 0;
    quarterOccupancy.push(occAvg);
    quarterAdr.push(adrAvg);
    quarterRevpar.push(revParForDay(adrAvg, occAvg));
  }

  const expenses = (values: number[]) => values.map(() => 0);
  const profit = (revenue: number[]) => revenue.map((v) => v);

  return {
    day: {
      labels: dayBuckets.map((b) => b.label),
      unitLabel: "hour block",
      summary: "Revenue posted today by time of day (UTC).",
      metrics: {
        revenue: dayRevenue,
        occupancy: dayOccupancy,
        adr: dayAdr,
        revpar: dayRevpar,
        expenses: expenses(dayRevenue),
        profit: profit(dayRevenue),
      },
    },
    week: {
      labels: weekLabels,
      unitLabel: "day",
      summary: "Daily gross revenue and room metrics for the last 7 days (UTC).",
      metrics: {
        revenue: weekRevenue,
        occupancy: weekOccupancy,
        adr: weekAdr,
        revpar: weekRevpar,
        expenses: expenses(weekRevenue),
        profit: profit(weekRevenue),
      },
    },
    month: {
      labels: monthLabels,
      unitLabel: "week",
      summary: "Rolling four-week totals from folio activity and PoS collections.",
      metrics: {
        revenue: monthRevenue,
        occupancy: monthOccupancy,
        adr: monthAdr,
        revpar: monthRevpar,
        expenses: expenses(monthRevenue),
        profit: profit(monthRevenue),
      },
    },
    quarter: {
      labels: quarterLabels,
      unitLabel: "month",
      summary: "Month-to-date commercial totals for the last three calendar months.",
      metrics: {
        revenue: quarterRevenue,
        occupancy: quarterOccupancy,
        adr: quarterAdr,
        revpar: quarterRevpar,
        expenses: expenses(quarterRevenue),
        profit: profit(quarterRevenue),
      },
    },
  };
}

export function emptyFinancialTrendViews(): FinancialTrendViews {
  const empty = (len: number) => zeroMetrics(len);
  return {
    day: {
      labels: ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"],
      unitLabel: "hour block",
      summary: "Revenue posted today by time of day (UTC).",
      metrics: empty(6),
    },
    week: {
      labels: ["—", "—", "—", "—", "—", "—", "—"],
      unitLabel: "day",
      summary: "Daily gross revenue for the last 7 days (UTC).",
      metrics: empty(7),
    },
    month: {
      labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
      unitLabel: "week",
      summary: "Rolling four-week revenue totals.",
      metrics: empty(4),
    },
    quarter: {
      labels: ["—", "—", "—"],
      unitLabel: "month",
      summary: "Monthly revenue totals.",
      metrics: empty(3),
    },
  };
}
