export type PeriodStatus = "open" | "closing" | "closed";

export type PeriodRow = {
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  status: PeriodStatus;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
};

export type PeriodChecks = {
  month: string;
  entryCount: number;
  /** Debits minus credits over the whole ledger up to the month end; anything but 0 is a fault. */
  trialBalanceDifference: number;
  /** Days in the month with no night audit run (only days that have already finished). */
  unauditedDates: string[];
};

const MONTH_RE = /^\d{4}-\d{2}-01$/;

export function isMonthStart(value: string): boolean {
  return MONTH_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** First day of the month holding `date` (YYYY-MM-DD in, YYYY-MM-DD out). */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEndOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function addMonths(month: string, count: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + count, 1)).toISOString().slice(0, 10);
}

/** Months from `from` to `to` inclusive, oldest first. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** True when `date` falls in a month marked closed. Mirrors what the database trigger enforces. */
export function isDateInClosedPeriod(periods: Pick<PeriodRow, "month" | "status">[], date: string): boolean {
  const month = monthStartOf(date);
  return periods.some((p) => p.month === month && p.status === "closed");
}

/** A month can only be closed once it has finished. */
export function canCloseMonth(month: string, today: string): { ok: true } | { ok: false; error: string } {
  if (!isMonthStart(month)) return { ok: false, error: "Pick a month." };
  if (monthEndOf(month) >= today) return { ok: false, error: "That month has not finished yet, so it cannot be closed." };
  return { ok: true };
}
