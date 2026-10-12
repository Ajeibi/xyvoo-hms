import { z } from "zod";
import { deliveryChargeFor, placeKey, type DeliveryZone } from "./delivery";

/*
 * Free delivery rules (store.delivery_free_rules). Delivery is free when every
 * condition a rule sets is met; a condition left empty doesn't count. Rules
 * are checked in order and the first match applies. Shared by the dashboard,
 * the checkout page (to show the shopper) and the checkout API (which decides).
 */

export type FreeDeliveryRule = {
  id: string;
  name: string;
  isActive: boolean;
  areas: string[];
  minSubtotal: number | null;
  minItems: number | null;
  productIds: string[];
  collectionIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  includeExtras: boolean;
  sortOrder: number;
};

export type FreeDeliveryRuleRow = {
  id: string;
  name: string;
  is_active: boolean;
  areas: string[] | null;
  min_subtotal: number | string | null;
  min_items: number | null;
  product_ids: string[] | null;
  collection_ids: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  include_extras: boolean;
  sort_order: number;
};

export const FREE_RULE_COLUMNS =
  "id, name, is_active, areas, min_subtotal, min_items, product_ids, collection_ids, starts_at, ends_at, include_extras, sort_order";

export function mapFreeRule(row: FreeDeliveryRuleRow): FreeDeliveryRule {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    areas: row.areas ?? [],
    minSubtotal: row.min_subtotal == null ? null : Number(row.min_subtotal),
    minItems: row.min_items,
    productIds: row.product_ids ?? [],
    collectionIds: row.collection_ids ?? [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    includeExtras: row.include_extras,
    sortOrder: row.sort_order,
  };
}

export const freeRuleSchema = z
  .object({
    name: z.string().trim().min(2, "Give the rule a name customers will understand, like “Free delivery in Lagos”.").max(80),
    isActive: z.boolean(),
    areas: z.array(z.string().trim().min(1).max(80)).max(60),
    minSubtotal: z.coerce.number().positive("Enter an amount above zero, or leave it blank.").max(100_000_000).nullable(),
    minItems: z.coerce.number().int("Enter a whole number of items.").positive("Enter at least 1, or leave it blank.").max(10_000).nullable(),
    productIds: z.array(z.string().uuid()).max(200),
    collectionIds: z.array(z.string().uuid()).max(50),
    startsAt: z.string().datetime({ offset: true }).nullable(),
    endsAt: z.string().datetime({ offset: true }).nullable(),
    includeExtras: z.boolean(),
  })
  .refine((r) => !r.startsAt || !r.endsAt || new Date(r.endsAt) > new Date(r.startsAt), { path: ["endsAt"], message: "The end date must be after the start date." })
  .refine(
    (r) => r.areas.length || r.minSubtotal !== null || r.minItems !== null || r.productIds.length || r.collectionIds.length || r.startsAt || r.endsAt,
    { path: ["areas"], message: "Add at least one condition, or every order would get free delivery." },
  );
export type FreeRuleInput = z.infer<typeof freeRuleSchema>;

export function toFreeRuleRow(r: FreeRuleInput) {
  return {
    name: r.name,
    is_active: r.isActive,
    areas: r.areas,
    min_subtotal: r.minSubtotal,
    min_items: r.minItems,
    product_ids: r.productIds,
    collection_ids: r.collectionIds,
    starts_at: r.startsAt,
    ends_at: r.endsAt,
    include_extras: r.includeExtras,
  };
}

/** A rule ready for checkout: collections already turned into the products they hold. */
export type CheckoutFreeRule = Pick<FreeDeliveryRule, "id" | "name" | "areas" | "minSubtotal" | "minItems" | "startsAt" | "endsAt" | "includeExtras"> & {
  /** Empty when the rule has no product condition. */
  productIds: string[];
  hasProductCondition: boolean;
};

const place = placeKey;

export type FreeDeliveryContext = {
  state: string;
  city: string;
  subtotal: number;
  lines: Array<{ productId: string; quantity: number }>;
  now?: Date;
};

export function ruleMatches(rule: CheckoutFreeRule, ctx: FreeDeliveryContext) {
  const now = ctx.now ?? new Date();
  if (rule.startsAt && now < new Date(rule.startsAt)) return false;
  if (rule.endsAt && now > new Date(rule.endsAt)) return false;
  if (rule.minSubtotal !== null && ctx.subtotal < rule.minSubtotal) return false;
  if (rule.minItems !== null && ctx.lines.reduce((n, l) => n + l.quantity, 0) < rule.minItems) return false;
  if (rule.hasProductCondition && !ctx.lines.some((l) => rule.productIds.includes(l.productId))) return false;
  if (rule.areas.length) {
    const where = [place(ctx.state), place(ctx.city)].filter(Boolean);
    if (!rule.areas.some((a) => where.includes(place(a)))) return false;
  }
  return true;
}

/** The first rule this order meets, if any. */
export function matchingFreeRule(rules: CheckoutFreeRule[], ctx: FreeDeliveryContext) {
  return rules.find((r) => ruleMatches(r, ctx)) ?? null;
}

/**
 * The delivery charge with free delivery rules applied: a matching rule waives
 * the option's fee, and products' extra charges too if the rule says so.
 */
export function deliveryWithRules(
  zone: Pick<DeliveryZone, "fee" | "freeOver" | "isPickup">,
  ctx: FreeDeliveryContext & { lines: Array<{ productId: string; quantity: number; deliveryExtra?: number | null }> },
  rules: CheckoutFreeRule[],
) {
  const full = deliveryChargeFor(zone, ctx.subtotal, ctx.lines);
  if (zone.isPickup || full === 0) return { fee: full, rule: null };
  const rule = matchingFreeRule(rules, ctx);
  if (!rule) return { fee: full, rule: null };
  const extrasOnly = deliveryChargeFor({ fee: 0, freeOver: null, isPickup: false }, ctx.subtotal, ctx.lines);
  return { fee: rule.includeExtras ? 0 : extrasOnly, rule };
}
