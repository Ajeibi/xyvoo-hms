import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DISCOUNT_COLUMNS, describeDiscount, mapDiscountCode, normaliseCode, CODE_PATTERN, type DiscountCode, type DiscountCodeRow, type DiscountInput, type DiscountLine } from "./discounts";
import { getStorePlan, storeHasFeature } from "./features";
import { effectivePrice, saleFromRow } from "./sale-price";

function storeDb() {
  return createServerSupabaseClient().schema("store");
}

/** A shop's code by what the customer typed, or null. */
export async function findDiscountByCode(tenantId: string, typed: string): Promise<DiscountCode | null> {
  const code = normaliseCode(typed);
  if (!CODE_PATTERN.test(code)) return null;
  const { data } = await storeDb().from("discount_codes").select(DISCOUNT_COLUMNS).eq("tenant_id", tenantId).eq("code", code).maybeSingle();
  return data ? mapDiscountCode(data as DiscountCodeRow) : null;
}

export type PromoBanner = { code: string; offer: string; endsAt: string };

/**
 * The code to show in the banner across the shop: switched on, started, not
 * ended, not used up, and the one ending soonest. Null when there is not one.
 */
export async function getPromoBanner(tenantId: string, formatMoney: (amount: number) => string): Promise<PromoBanner | null> {
  const { data, error } = await storeDb()
    .from("discount_codes")
    .select(DISCOUNT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("show_banner", true)
    .eq("is_active", true)
    .gt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: true })
    .limit(5);
  if (error || !data?.length) return null;
  const now = new Date();
  const codes = (data as DiscountCodeRow[]).map(mapDiscountCode).filter((c) => !c.startsAt || new Date(c.startsAt) <= now);
  const uses = await countDiscountUses(tenantId, codes.filter((c) => c.usageLimit != null).map((c) => c.id));
  const live = codes.find((c) => c.usageLimit == null || (uses.get(c.id) ?? 0) < c.usageLimit);
  if (!live?.endsAt) return null;
  return { code: live.code, offer: describeDiscount(live, formatMoney), endsAt: live.endsAt };
}

/** The products a code covers (its own plus those in its collections), or null when it covers everything. */
export async function discountProductIds(code: Pick<DiscountCode, "productIds" | "collectionIds">): Promise<string[] | null> {
  if (!code.productIds.length && !code.collectionIds.length) return null;
  const ids = new Set(code.productIds);
  if (code.collectionIds.length) {
    const { data } = await storeDb().from("collection_products").select("product_id").in("collection_id", code.collectionIds);
    for (const row of data || []) ids.add(row.product_id as string);
  }
  return [...ids];
}

/** How many live orders have used each code (cancelled and failed orders give their use back). */
export async function countDiscountUses(tenantId: string, codeIds: string[]) {
  const uses = new Map<string, number>();
  if (!codeIds.length) return uses;
  const { data } = await storeDb()
    .from("orders")
    .select("discount_code_id, payment_status")
    .eq("tenant_id", tenantId)
    .in("discount_code_id", codeIds)
    .neq("status", "Cancelled");
  for (const row of data || []) {
    if (row.payment_status === "failed") continue;
    const id = row.discount_code_id as string;
    uses.set(id, (uses.get(id) ?? 0) + 1);
  }
  return uses;
}

export type PricedBasketLine = DiscountLine & {
  variantId: string | null;
  quantity: number;
  /** What one costs now, sale included. */
  unitPrice: number;
  taxable: boolean;
  taxClass: string | null;
};

type ProductPriceRow = {
  id: string;
  price: number | string;
  taxable?: boolean | null;
  tax_class?: string | null;
  sale_price?: number | string | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
};
type VariantPriceRow = {
  id: string;
  product_id: string;
  price_override: number | string | null;
  sale_price?: number | string | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
};

/** Whether a query failed only because the sale columns haven't been added yet. */
const missingSaleColumns = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "42703" || /sale_(price|starts_at|ends_at)/.test(error.message || "")));

/**
 * Basket lines priced the way checkout prices them (sale prices included,
 * see effectivePrice), so a code previewed in the basket matches the order.
 * Works before the sale price columns exist, at normal prices.
 */
export async function priceBasketLines(
  tenantId: string,
  items: { productId: string; variantId?: string | null; quantity: number }[],
  now: Date = new Date(),
): Promise<PricedBasketLine[]> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const variantIds = [...new Set(items.map((i) => i.variantId).filter((v): v is string => Boolean(v)))];
  const readProducts = async () => {
    const full = await storeDb().from("products").select("id, price, taxable, tax_class, sale_price, sale_starts_at, sale_ends_at").eq("tenant_id", tenantId).in("id", productIds);
    if (!missingSaleColumns(full.error)) return (full.data || []) as ProductPriceRow[];
    const basic = await storeDb().from("products").select("id, price, taxable, tax_class").eq("tenant_id", tenantId).in("id", productIds);
    return (basic.data || []) as ProductPriceRow[];
  };
  const readVariants = async () => {
    if (!variantIds.length) return [] as VariantPriceRow[];
    const full = await storeDb().from("product_variants").select("id, product_id, price_override, sale_price, sale_starts_at, sale_ends_at").in("id", variantIds).in("product_id", productIds);
    if (!missingSaleColumns(full.error)) return (full.data || []) as VariantPriceRow[];
    const basic = await storeDb().from("product_variants").select("id, product_id, price_override").in("id", variantIds).in("product_id", productIds);
    return (basic.data || []) as VariantPriceRow[];
  };
  const [products, variants] = await Promise.all([readProducts(), readVariants()]);
  const salesEnabled = products.some((p) => p.sale_price != null) || variants.some((v) => v.sale_price != null) ? storeHasFeature(await getStorePlan(tenantId), "flashSales") : false;

  const productById = new Map(products.map((p) => [p.id, p]));
  const variantById = new Map(variants.map((v) => [v.id, v]));
  return items
    .filter((i) => productById.has(i.productId))
    .map((i) => {
      const p = productById.get(i.productId) as ProductPriceRow;
      const v = i.variantId ? variantById.get(i.variantId) : undefined;
      const variant = v && v.product_id === i.productId ? { priceOverride: v.price_override == null ? null : Number(v.price_override), ...saleFromRow(v) } : null;
      const { price } = effectivePrice({ price: Number(p.price), ...saleFromRow(p) }, variant, now, salesEnabled);
      return {
        productId: i.productId,
        variantId: variant ? (i.variantId as string) : null,
        quantity: i.quantity,
        unitPrice: price,
        lineTotal: Math.round(price * i.quantity * 100) / 100,
        taxable: p.taxable !== false,
        taxClass: p.tax_class ?? null,
      };
    });
}

/**
 * Keeps only products and collections that belong to this shop. Returns null
 * when products were chosen but none are left (deleted, or not this shop's),
 * because an empty list would otherwise mean the code works on everything.
 */
export async function ownedTargets(service: SupabaseClient, tenantId: string, input: DiscountInput) {
  const db = service.schema("store");
  const [products, collections] = await Promise.all([
    input.productIds.length ? db.from("products").select("id").eq("tenant_id", tenantId).in("id", input.productIds) : Promise.resolve({ data: [] }),
    input.collectionIds.length ? db.from("collections").select("id").eq("tenant_id", tenantId).in("id", input.collectionIds) : Promise.resolve({ data: [] }),
  ]);
  const productIds = (products.data || []).map((p) => p.id as string);
  const collectionIds = (collections.data || []).map((c) => c.id as string);
  const chose = input.productIds.length + input.collectionIds.length > 0;
  if (chose && productIds.length + collectionIds.length === 0) return null;
  return { ...input, productIds, collectionIds };
}

export const duplicateCode = () => NextResponse.json({ error: "You already have a code with that name. Choose another." }, { status: 409 });

export const noTargetsLeft = () =>
  NextResponse.json({ error: "The products or collections you chose no longer exist. Choose others, or let the code work on everything." }, { status: 400 });
