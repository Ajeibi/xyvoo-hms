import { PLAN_FEE_RATES, type StorePlan } from "./site/onboarding";

/**
 * Pure billing rules for store plans. Fees are fractions (0.04 = 4%).
 *
 * A Standard store pays no platform fee while its subscription is paid up:
 * active or cancelled-but-paid-to-the-end-of-the-period, or past due but
 * still inside the grace period. Otherwise it falls back to the Free fee.
 * Free and Enterprise stores pay their stored rate (Enterprise is agreed per
 * store by a platform admin).
 */

export const STANDARD_PRICE = 10_000;
export const STANDARD_CURRENCY = "NGN";
/** Days a Standard store keeps 0% after a renewal payment fails. */
export const GRACE_DAYS = 7;

export type SubscriptionState = {
  plan: StorePlan;
  status: "active" | "pending_payment" | "past_due" | "cancelled";
  platform_fee_rate: number | string;
  current_period_end: string | null;
  grace_ends_at: string | null;
};

export function isStandardPaidUp(sub: SubscriptionState | null, now = Date.now()) {
  if (!sub || sub.plan !== "standard") return false;
  const paidUntil = sub.current_period_end ? Date.parse(sub.current_period_end) : 0;
  const graceUntil = sub.grace_ends_at ? Date.parse(sub.grace_ends_at) : 0;
  if ((sub.status === "active" || sub.status === "cancelled") && paidUntil > now) return true;
  return sub.status === "past_due" && graceUntil > now;
}

export function effectiveFeeRate(sub: SubscriptionState | null, now = Date.now()): number {
  if (!sub) return PLAN_FEE_RATES.free;
  if (sub.plan === "standard") return isStandardPaidUp(sub, now) ? 0 : PLAN_FEE_RATES.free;
  const rate = Number(sub.platform_fee_rate);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : PLAN_FEE_RATES.free;
}

/** XYVOO's share of a payment, in the currency's smallest unit (kobo for naira). */
export function platformFeeSubunits(totalSubunits: number, rate: number) {
  return Math.round(totalSubunits * rate);
}

export function addMonths(from: Date, months: number) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function addDays(from: Date, days: number) {
  return new Date(from.getTime() + days * 86_400_000);
}

/** Human description of where a store's plan stands, for the dashboard. */
export function describeSubscription(sub: SubscriptionState | null, now = Date.now()) {
  if (!sub) return "Free plan";
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
  if (sub.plan === "enterprise") return "Enterprise plan";
  if (sub.plan === "free") return "Free plan";
  if (sub.status === "pending_payment") return "Standard chosen, not yet paid. Free terms apply until it is.";
  if (sub.status === "active") return `Standard plan. Renews on ${date(sub.current_period_end)}.`;
  if (sub.status === "cancelled") {
    return isStandardPaidUp(sub, now) ? `Standard plan until ${date(sub.current_period_end)}, then Free.` : "Free plan (Standard ended).";
  }
  return isStandardPaidUp(sub, now)
    ? `Standard renewal failed. Update your card by ${date(sub.grace_ends_at)} to keep 0% fees.`
    : "Free plan (Standard renewal failed).";
}
