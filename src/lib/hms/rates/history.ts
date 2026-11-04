import { formatPricingAmount } from "@/lib/hms/room-pricing";

/** The audit-log actions the rate book writes, in plain words. Used by the History tab. */
export const RATE_ACTIONS = [
  "rate_plan_created",
  "rate_plan_updated",
  "rate_plan_deleted",
  "rate_plan_default_changed",
  "rate_price_created",
  "rate_price_updated",
  "rate_price_deleted",
  "rate_restriction_created",
  "rate_restriction_updated",
  "rate_restriction_deleted",
  "price_suggestion_accepted",
  "price_suggestion_dismissed",
  "revenue_settings_saved",
] as const;

type State = Record<string, unknown> | null;

const str = (v: unknown) => (typeof v === "string" && v ? v : "");
const dates = (s: State) => {
  if (!s) return "";
  const from = str(s.dateFrom ?? s.stayDate);
  const to = str(s.dateTo);
  if (!from) return "";
  return to && to !== from ? `${from} to ${to}` : from;
};

export function describeRateChange(action: string, before: State, after: State, currency: string): string {
  const money = (v: unknown) => formatPricingAmount(Number(v), currency);
  const state = after ?? before;
  switch (action) {
    case "rate_plan_created":
      return `Created the plan ${str(state?.name)} (${str(state?.code)}).`;
    case "rate_plan_updated":
      return `Changed the plan ${str(state?.name)}.`;
    case "rate_plan_deleted":
      return `Deleted the plan ${str(state?.name)}.`;
    case "rate_plan_default_changed":
      return `Made ${str(state?.code)} the default plan.`;
    case "rate_price_created":
      return `Set a price of ${money(state?.price)} for ${dates(state) || "some dates"}${state?.label ? ` (${str(state.label)})` : ""}.`;
    case "rate_price_updated":
      return `Changed the price for ${dates(state)}${before ? ` from ${money(before.price)}` : ""} to ${money(after?.price)}.`;
    case "rate_price_deleted":
      return `Removed the price of ${money(before?.price)} for ${dates(before)}.`;
    case "rate_restriction_created":
      return `Added a restriction for ${dates(state)}${state?.note ? ` (${str(state.note)})` : ""}.`;
    case "rate_restriction_updated":
      return `Changed the restriction for ${dates(state)}.`;
    case "rate_restriction_deleted":
      return `Removed the restriction for ${dates(before)}.`;
    case "price_suggestion_accepted":
      return `Accepted a price suggestion for ${str(after?.stayDate)}: ${money(after?.from)} to ${money(after?.to)}.`;
    case "price_suggestion_dismissed":
      return `Dismissed a price suggestion for ${str(after?.stayDate)}.`;
    case "revenue_settings_saved":
      return "Changed the price suggestion limits.";
    default:
      return action.replace(/_/g, " ");
  }
}
