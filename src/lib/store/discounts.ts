/*
 * Discount codes: the rules for what a code takes off a basket. No server
 * code, so the dashboard and checkout can both use it. How many times a code
 * has been used is checked on the server when the order is placed.
 */
import { z } from "zod";

/** free_delivery waives the delivery charge and takes nothing off the items. */
export type DiscountKind = "percent" | "fixed" | "free_delivery";

export type DiscountCode = {
  id: string;
  code: string;
  description: string | null;
  kind: DiscountKind;
  value: number;
  productIds: string[];
  collectionIds: string[];
  minSubtotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  isActive: boolean;
  /** Show the code across the shop with a countdown to its last day. */
  showBanner: boolean;
  /** Set on a customer's friend code: the account that shared it. Not shown in the shop's discount list. */
  referralAccountId: string | null;
  createdAt: string;
};

export type DiscountCodeRow = {
  id: string;
  code: string;
  description: string | null;
  kind: DiscountKind;
  value: number | string;
  product_ids: string[] | null;
  collection_ids: string[] | null;
  min_subtotal: number | string | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  is_active: boolean;
  show_banner?: boolean | null;
  referral_account_id?: string | null;
  created_at: string;
};

export const DISCOUNT_COLUMNS =
  "id, code, description, kind, value, product_ids, collection_ids, min_subtotal, starts_at, ends_at, usage_limit, per_customer_limit, is_active, show_banner, referral_account_id, created_at";

export function mapDiscountCode(row: DiscountCodeRow): DiscountCode {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    kind: row.kind,
    value: Number(row.value),
    productIds: row.product_ids ?? [],
    collectionIds: row.collection_ids ?? [],
    minSubtotal: row.min_subtotal != null ? Number(row.min_subtotal) : null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    usageLimit: row.usage_limit,
    perCustomerLimit: row.per_customer_limit,
    isActive: row.is_active,
    showBanner: Boolean(row.show_banner),
    referralAccountId: row.referral_account_id ?? null,
    createdAt: row.created_at,
  };
}

/** Codes are stored in capitals; customers can type them in any case, with stray spaces. */
export function normaliseCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export const CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;

const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), "Enter a valid date.");

const optionalPositive = (message: string) =>
  z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), message);

/** The dashboard form. Amounts are in the shop's home currency. */
export const discountInputSchema = z
  .object({
    code: z
      .string()
      .transform(normaliseCode)
      .refine((v) => CODE_PATTERN.test(v), "Use 3 to 30 letters or numbers (dashes and underscores are fine), with no spaces."),
    description: z.string().trim().max(200, "Keep the note under 200 characters.").optional().nullable().transform((v) => v || null),
    kind: z.enum(["percent", "fixed", "free_delivery"]),
    // Not needed for free delivery (stored as 0).
    value: z.union([z.number(), z.string(), z.null()]).optional().transform((v) => (v === "" || v === null || v === undefined ? 0 : Number(v))),
    productIds: z.array(z.string().uuid()).max(500).default([]),
    collectionIds: z.array(z.string().uuid()).max(100).default([]),
    minSubtotal: optionalPositive("The minimum spend must be more than zero, or left empty."),
    startsAt: optionalDate,
    endsAt: optionalDate,
    usageLimit: optionalPositive("The number of uses must be at least 1, or left empty.").refine((v) => v === null || Number.isInteger(v), "Use a whole number."),
    perCustomerLimit: optionalPositive("The uses per customer must be at least 1, or left empty.").refine((v) => v === null || Number.isInteger(v), "Use a whole number."),
    isActive: z.boolean().default(true),
    showBanner: z.boolean().default(false),
  })
  .transform((d) => (d.kind === "free_delivery" ? { ...d, value: 0 } : d))
  .superRefine((d, ctx) => {
    if (d.kind !== "free_delivery" && !(Number.isFinite(d.value) && d.value > 0)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter how much the code takes off." });
    }
    if (d.kind === "percent" && d.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage can't be more than 100." });
    if (d.showBanner && !d.endsAt) ctx.addIssue({ code: "custom", path: ["showBanner"], message: "Choose a last day to show a countdown." });
    if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end date must be after the start date." });
    }
  });

export type DiscountInput = z.infer<typeof discountInputSchema>;

export function toDiscountRow(input: DiscountInput) {
  return {
    code: input.code,
    description: input.description,
    kind: input.kind,
    value: input.value,
    product_ids: input.productIds,
    collection_ids: input.collectionIds,
    min_subtotal: input.minSubtotal,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    usage_limit: input.usageLimit,
    per_customer_limit: input.perCustomerLimit,
    is_active: input.isActive,
    show_banner: input.showBanner,
  };
}

export type DiscountLine = { productId: string; lineTotal: number };

export type DiscountCheck =
  /** amount is what comes off the items (0 for free delivery); freeDelivery waives the delivery charge. */
  | { ok: true; amount: number; eligibleSubtotal: number; freeDelivery: boolean }
  | { ok: false; reason: "inactive" | "not_started" | "ended" | "min_spend" | "no_eligible_items"; message: string };

/**
 * What a code takes off these basket lines right now. `eligibleProductIds`
 * is the code's products plus the products in its collections (empty means
 * everything). Never more than the eligible items cost. Only a free delivery
 * code touches delivery: it needs at least one eligible item in the basket.
 */
export function checkDiscount(
  code: Pick<DiscountCode, "kind" | "value" | "minSubtotal" | "startsAt" | "endsAt" | "isActive">,
  lines: DiscountLine[],
  eligibleProductIds: string[] | null,
  now: Date,
  formatMoney: (amount: number) => string = (a) => a.toFixed(2),
): DiscountCheck {
  if (!code.isActive) return { ok: false, reason: "inactive", message: "That code isn't valid." };
  if (code.startsAt && new Date(code.startsAt) > now) return { ok: false, reason: "not_started", message: "That code can't be used yet." };
  if (code.endsAt && new Date(code.endsAt) <= now) return { ok: false, reason: "ended", message: "That code has expired." };

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  if (code.minSubtotal != null && subtotal < code.minSubtotal) {
    return { ok: false, reason: "min_spend", message: `That code needs a spend of at least ${formatMoney(code.minSubtotal)}.` };
  }

  const eligible = eligibleProductIds && eligibleProductIds.length ? new Set(eligibleProductIds) : null;
  const eligibleSubtotal = round2(lines.filter((l) => !eligible || eligible.has(l.productId)).reduce((sum, l) => sum + l.lineTotal, 0));
  if (eligibleSubtotal <= 0) return { ok: false, reason: "no_eligible_items", message: "That code doesn't apply to anything in your basket." };

  if (code.kind === "free_delivery") return { ok: true, amount: 0, eligibleSubtotal, freeDelivery: true };
  const raw = code.kind === "percent" ? (eligibleSubtotal * code.value) / 100 : code.value;
  return { ok: true, amount: round2(Math.min(raw, eligibleSubtotal)), eligibleSubtotal, freeDelivery: false };
}

/**
 * A one-line summary, e.g. "10% off everything", "₦2,000 off selected
 * products, on orders over ₦10,000" or "Free delivery on orders over ₦10,000".
 */
export function describeDiscount(
  code: Pick<DiscountCode, "kind" | "value" | "productIds" | "collectionIds" | "minSubtotal">,
  formatMoney: (amount: number) => string,
) {
  if (code.kind === "free_delivery") {
    const withSome = code.productIds.length || code.collectionIds.length ? " with selected products" : "";
    const over = code.minSubtotal != null ? ` on orders over ${formatMoney(code.minSubtotal)}` : "";
    return `Free delivery${withSome}${over}`;
  }
  const amount = code.kind === "percent" ? `${trimNumber(code.value)}% off` : `${formatMoney(code.value)} off`;
  const scope = code.productIds.length || code.collectionIds.length ? "selected products" : "everything";
  const min = code.minSubtotal != null ? `, on orders over ${formatMoney(code.minSubtotal)}` : "";
  return `${amount} ${scope}${min}`;
}

/** "2 days 4 hours left", "5 hours 12 minutes left" or "23 minutes left"; null once it has ended. */
export function countdownLabel(endsAt: string, now: Date) {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days >= 1) return `${hours ? `${plural(days, "day")} ${plural(hours, "hour")}` : plural(days, "day")} left`;
  if (hours >= 1) return `${mins ? `${plural(hours, "hour")} ${plural(mins, "minute")}` : plural(hours, "hour")} left`;
  return `${plural(mins, "minute")} left`;
}

/** Where a code stands today, for the dashboard. */
export function discountState(code: Pick<DiscountCode, "isActive" | "startsAt" | "endsAt" | "usageLimit">, uses: number, now: Date) {
  if (!code.isActive) return "paused" as const;
  if (code.endsAt && new Date(code.endsAt) <= now) return "ended" as const;
  if (code.usageLimit != null && uses >= code.usageLimit) return "used_up" as const;
  if (code.startsAt && new Date(code.startsAt) > now) return "scheduled" as const;
  return "active" as const;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const trimNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
