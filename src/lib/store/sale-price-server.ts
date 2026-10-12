import { NextResponse } from "next/server";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStorePlan, storeHasFeature } from "./features";
import { SALE_KEYS, saleWriteSchema, setsASale, type SaleWrite } from "./sale-price";
import { TAX_CLASSES } from "./tax";
import type { VariantInput } from "./variants";

type Service = ReturnType<typeof createServerSupabaseClient>;

const bad = (error: string) => ({ error: NextResponse.json({ error, field: "sale_price" }, { status: 400 }) });
const UPGRADE = "Sale prices that switch on and off by themselves are part of the Standard plan. Upgrade in Payments and plan to use them.";

type StoredSale = { id: string; price?: number | string | null; price_override?: number | string | null; sale_price: number | string | null; sale_starts_at: string | null; sale_ends_at: string | null };

const hasSaleKeys = (o: Record<string, unknown> | null | undefined) => Boolean(o && SALE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(o, k)));
const same = (a: SaleWrite, b: StoredSale | undefined) =>
  Boolean(b) &&
  (a.sale_price ?? null) === (b!.sale_price == null ? null : Number(b!.sale_price)) &&
  (a.sale_starts_at ?? null) === (b!.sale_starts_at ? new Date(b!.sale_starts_at).toISOString() : null) &&
  (a.sale_ends_at ?? null) === (b!.sale_ends_at ? new Date(b!.sale_ends_at).toISOString() : null);

/** The product fields to write: what was sent, with the sale and tax fields replaced by their checked versions. */
export function withCheckedPricing(updates: Record<string, unknown>, fields: Record<string, unknown>) {
  const out = { ...updates };
  for (const key of SALE_KEYS) delete out[key];
  delete out.tax_class;
  return { ...out, ...fields };
}

/**
 * Checks the pricing fields of a product save before it's written: the sale
 * price and dates (on the product and each variant) and the tax class.
 *
 * - A sale must end after it starts and be below the normal price.
 * - Setting or changing a sale needs the Standard plan; a Free shop gets the
 *   upgrade message. A sale saved unchanged (say, after a downgrade) and
 *   clearing a sale are always allowed.
 * - Before the sale columns exist, empty sale fields are dropped from the
 *   save so it still goes through, and setting a sale is refused politely.
 *
 * Returns the cleaned fields to write in place of what was sent.
 */
export async function checkPricingWrite(
  service: Service,
  tenantId: string,
  body: Record<string, unknown>,
  productId: string | null,
): Promise<{ error: NextResponse } | { error?: undefined; fields: Record<string, unknown>; variants: VariantInput[] | undefined }> {
  const fields: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, "tax_class")) {
    const cls = typeof body.tax_class === "string" ? body.tax_class.trim().toLowerCase() : null;
    if (cls && !(TAX_CLASSES as readonly string[]).includes(cls)) {
      return { error: NextResponse.json({ error: "Choose standard, zero-rated or exempt for the tax class.", field: "tax_class" }, { status: 400 }) };
    }
    fields.tax_class = cls || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "taxable") && typeof body.taxable !== "boolean") {
    return { error: NextResponse.json({ error: "Say whether tax applies to this product.", field: "taxable" }, { status: 400 }) };
  }

  const incomingVariants = Array.isArray(body.variants) ? (body.variants as VariantInput[]) : undefined;
  const variantsTouchSales = incomingVariants?.some((v) => hasSaleKeys(v as Record<string, unknown>)) ?? false;
  if (!hasSaleKeys(body) && !variantsTouchSales) return { fields, variants: incomingVariants };

  // The product's own sale.
  const parsed = saleWriteSchema.safeParse(Object.fromEntries(SALE_KEYS.filter((k) => k in body).map((k) => [k, body[k]])));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message || "Check the sale price and dates.");
  const productSale = parsed.data;

  // Each variant's own sale.
  const variantSales: SaleWrite[] = [];
  for (const v of incomingVariants ?? []) {
    const p = saleWriteSchema.safeParse(Object.fromEntries(SALE_KEYS.filter((k) => k in v).map((k) => [k, (v as Record<string, unknown>)[k]])));
    if (!p.success) return bad(`${Object.values(v.options || {}).join(" / ") || "A variant"}: ${p.error.issues[0]?.message || "check the sale price and dates."}`);
    variantSales.push(p.data);
  }

  const setting = setsASale(productSale) || variantSales.some(setsASale);
  const db = service.schema("store");

  // Are the sale columns there yet? (And what's stored now, to compare with.)
  const stored = productId
    ? await db.from("products").select("id, price, sale_price, sale_starts_at, sale_ends_at").eq("id", productId).eq("tenant_id", tenantId).maybeSingle()
    : await db.from("products").select("sale_price").eq("tenant_id", tenantId).limit(1);
  const columnsMissing = Boolean(stored.error && (stored.error.code === "42703" || /sale_/.test(stored.error.message || "")));
  if (columnsMissing) {
    if (setting) return { error: NextResponse.json({ error: "Sale prices aren't ready on your shop just yet. Please try again later." }, { status: 503 }) };
    // Nothing to save: leave the empty sale fields out so the rest of the product saves.
    return {
      fields,
      variants: incomingVariants?.map((v) => {
        const rest = { ...v };
        delete rest.sale_price;
        delete rest.sale_starts_at;
        delete rest.sale_ends_at;
        return rest;
      }),
    };
  }

  const storedProduct = productId ? ((stored.data as StoredSale | null) ?? undefined) : undefined;
  const storedVariants = new Map<string, StoredSale>();
  if (productId && incomingVariants?.length) {
    const { data } = await db.from("product_variants").select("id, price_override, sale_price, sale_starts_at, sale_ends_at").eq("product_id", productId);
    for (const row of (data || []) as StoredSale[]) storedVariants.set(row.id, row);
  }

  // A sale price must be below the price it replaces.
  const normalPrice = typeof body.price === "number" ? body.price : storedProduct?.price != null ? Number(storedProduct.price) : null;
  if (productSale.sale_price != null && normalPrice != null && productSale.sale_price >= normalPrice) {
    return bad("The sale price must be lower than the normal price.");
  }
  for (const [i, v] of (incomingVariants ?? []).entries()) {
    const sale = variantSales[i].sale_price;
    const regular = v.price_override ?? normalPrice;
    if (sale != null && regular != null && sale >= regular) {
      return bad(`${Object.values(v.options || {}).join(" / ") || "A variant"}: the sale price must be lower than its normal price.`);
    }
  }

  // Plan: setting or changing a sale needs flash sales.
  if (setting && !storeHasFeature(await getStorePlan(tenantId), "flashSales")) {
    const productChanged = setsASale(productSale) && !same(productSale, storedProduct);
    const variantChanged = (incomingVariants ?? []).some((v, i) => setsASale(variantSales[i]) && !same(variantSales[i], v.id ? storedVariants.get(v.id) : undefined));
    if (productChanged || variantChanged) {
      return { error: NextResponse.json({ error: UPGRADE, upgrade: true, field: "sale_price" }, { status: 403 }) };
    }
  }

  // Sending a sale price without dates clears old dates only if they were sent; a cleared sale clears its dates.
  const productFields: Record<string, unknown> = { ...productSale };
  if (productSale.sale_price === null) {
    productFields.sale_starts_at = null;
    productFields.sale_ends_at = null;
  }
  return {
    fields: { ...fields, ...productFields },
    variants: incomingVariants?.map((v, i) => {
      const sale = variantSales[i];
      const cleared = sale.sale_price === null ? { sale_starts_at: null, sale_ends_at: null } : {};
      return { ...v, ...sale, ...cleared };
    }),
  };
}
