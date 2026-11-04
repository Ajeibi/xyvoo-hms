import { fbPosRevenueForUtcDay, type DashboardFbOrderRow } from "@/lib/hms/dashboard-fb-metrics";

export type FolioRevenueRow = {
  reservation_id: string;
  kind: string;
  amount: string | number;
  voided_at: string | null;
  created_at: string;
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
