import { formatPricingAmount } from "@/lib/hms/room-pricing";

/*
 * Cancellation policies: how late a guest can cancel for free, and the fee after that. Pure rules,
 * safe for the browser and the server. A booking keeps the policy it was made under.
 */

export const FEE_KINDS = ["none", "first_night", "percent", "fixed", "full_stay"] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

export const FEE_KIND_LABEL: Record<FeeKind, string> = {
  none: "No fee",
  first_night: "The first night",
  percent: "A percentage of the stay",
  fixed: "A fixed amount",
  full_stay: "The whole stay",
};

export type CancellationPolicy = {
  roomTypeCode: string | null;
  name: string;
  freeDaysBeforeArrival: number;
  lateFeeKind: FeeKind;
  lateFeeValue: number;
  noShowFeeKind: FeeKind;
  noShowFeeValue: number;
};

/** What a hotel gets before it sets its own: free until two days before, then the first night. */
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  roomTypeCode: null,
  name: "Standard",
  freeDaysBeforeArrival: 2,
  lateFeeKind: "first_night",
  lateFeeValue: 0,
  noShowFeeKind: "full_stay",
  noShowFeeValue: 0,
};

export function money(n: number) {
  return Math.round(n * 100) / 100;
}

/** The policy for a room type: its own, else the hotel's default, else the built-in one. */
export function cancellationPolicyFor(policies: CancellationPolicy[], roomTypeCode: string | null | undefined): CancellationPolicy {
  return (
    policies.find((p) => roomTypeCode && p.roomTypeCode === roomTypeCode) ??
    policies.find((p) => p.roomTypeCode === null) ??
    DEFAULT_CANCELLATION_POLICY
  );
}

/** The fee for a kind and value, on a stay worth `stayTotal` (taxes included) over `nights`. Never more than the stay. */
export function feeFor(kind: FeeKind, value: number, stay: { stayTotal: number; nights: number }): number {
  const total = Math.max(0, stay.stayTotal);
  let fee = 0;
  if (kind === "full_stay") fee = total;
  else if (kind === "first_night") fee = total / Math.max(1, stay.nights);
  else if (kind === "percent") fee = (total * Math.min(100, Math.max(0, value))) / 100;
  else if (kind === "fixed") fee = Math.max(0, value);
  return money(Math.min(fee, total));
}

/** Whole days from today to the arrival day (negative once the arrival day has passed). */
export function daysUntil(arrivalDay: string, today: string): number {
  const a = new Date(`${arrivalDay}T12:00:00.000Z`).getTime();
  const t = new Date(`${today}T12:00:00.000Z`).getTime();
  return Math.round((a - t) / 86_400_000);
}

export type CancellationQuote = {
  free: boolean;
  daysBeforeArrival: number;
  /** The fee under the policy, before any decision to waive it. */
  fee: number;
  feeKind: FeeKind;
  /** Why, in plain words. */
  summary: string;
};

export function quoteCancellation(
  policy: CancellationPolicy,
  stay: { arrivalDay: string; today: string; stayTotal: number; nights: number },
  opts: { noShow?: boolean } = {},
): CancellationQuote {
  const days = daysUntil(stay.arrivalDay, stay.today);
  if (opts.noShow) {
    const fee = feeFor(policy.noShowFeeKind, policy.noShowFeeValue, stay);
    return { free: fee === 0, daysBeforeArrival: days, fee, feeKind: policy.noShowFeeKind, summary: fee > 0 ? "The guest did not arrive, so the no-show fee applies." : "No fee for a no-show under this policy." };
  }
  const free = days >= policy.freeDaysBeforeArrival;
  if (free) {
    return {
      free: true,
      daysBeforeArrival: days,
      fee: 0,
      feeKind: "none",
      summary:
        policy.freeDaysBeforeArrival === 0
          ? "This policy allows free cancellation up to the day of arrival."
          : `Cancelled ${days} day${days === 1 ? "" : "s"} before arrival, which is within the free period (${policy.freeDaysBeforeArrival} day${policy.freeDaysBeforeArrival === 1 ? "" : "s"} or more).`,
    };
  }
  const fee = feeFor(policy.lateFeeKind, policy.lateFeeValue, stay);
  return {
    free: fee === 0,
    daysBeforeArrival: days,
    fee,
    feeKind: policy.lateFeeKind,
    summary:
      days < 0
        ? "The arrival date has passed, so the late cancellation fee applies."
        : `Cancelled ${days} day${days === 1 ? "" : "s"} before arrival, later than the free period (${policy.freeDaysBeforeArrival} day${policy.freeDaysBeforeArrival === 1 ? "" : "s"}), so the late cancellation fee applies.`,
  };
}

function feeWords(kind: FeeKind, value: number, currency: string) {
  if (kind === "none") return "no fee";
  if (kind === "first_night") return "the first night";
  if (kind === "full_stay") return "the whole stay";
  if (kind === "percent") return `${value}% of the stay`;
  return formatPricingAmount(value, currency);
}

/** The policy as sentences a guest can read (used on screen and in emails). */
export function describePolicy(p: CancellationPolicy, currency: string): string[] {
  const lines: string[] = [];
  lines.push(
    p.freeDaysBeforeArrival === 0
      ? "You can cancel free of charge up to the day you arrive."
      : `You can cancel free of charge up to ${p.freeDaysBeforeArrival} day${p.freeDaysBeforeArrival === 1 ? "" : "s"} before you arrive.`,
  );
  lines.push(
    p.lateFeeKind === "none"
      ? "Later cancellations are free too."
      : `After that, cancelling costs ${feeWords(p.lateFeeKind, p.lateFeeValue, currency)}.`,
  );
  if (p.noShowFeeKind !== "none") lines.push(`If you do not arrive, the charge is ${feeWords(p.noShowFeeKind, p.noShowFeeValue, currency)}.`);
  return lines;
}

/** The booking's own policy (kept when it was made), else the current one. */
export function policyFromSnapshot(snapshot: unknown): CancellationPolicy | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  const kind = (v: unknown, fallback: FeeKind): FeeKind => ((FEE_KINDS as readonly string[]).includes(v as string) ? (v as FeeKind) : fallback);
  if (typeof s.freeDaysBeforeArrival !== "number") return null;
  return {
    roomTypeCode: typeof s.roomTypeCode === "string" ? s.roomTypeCode : null,
    name: typeof s.name === "string" ? s.name : "Standard",
    freeDaysBeforeArrival: s.freeDaysBeforeArrival,
    lateFeeKind: kind(s.lateFeeKind, "first_night"),
    lateFeeValue: Number(s.lateFeeValue) || 0,
    noShowFeeKind: kind(s.noShowFeeKind, "full_stay"),
    noShowFeeValue: Number(s.noShowFeeValue) || 0,
  };
}
