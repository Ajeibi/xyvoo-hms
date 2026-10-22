import { addToStock, stockChange } from "./stock-edit";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StoreProductVariantRow } from "./products";

/*
 * Saving a product's variants in place. Orders, baskets and abandoned
 * checkouts point at variant ids, so a save updates the variants it can match
 * (by id, else by the same options), adds new ones, and only deletes a
 * removed variant when nothing has been ordered from it: otherwise it is
 * archived with its stock set to 0, so it stops being sold but past orders
 * keep their link (and cancelling one still restocks the right variant).
 */

export type VariantInput = {
  id?: string;
  options: Record<string, string>;
  sku?: string;
  price_override?: number;
  /** The variant's own sale (flash sales, Standard plan). Left out entirely when not sent, so saves work before the sale columns exist. */
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  /** Its own prices in currencies the shop prices by hand, e.g. { USD: 25 }. Left out when not sent, so saves work before the column exists. */
  currency_prices?: Record<string, number>;
  stock?: number;
  /** The stock when the editor opened: then only the change is added (see stock-edit.ts). */
  stock_was?: number;
  image_url?: string;
  barcode?: string;
  weight_kg?: number;
};

type Existing = Pick<StoreProductVariantRow, "id" | "options" | "archived_at">;

/** "Colour=Red, Size=M" and "Size=M, Colour=Red" are the same variant. */
export function optionsKey(options: Record<string, string>) {
  return Object.entries(options || {})
    .map(([k, v]) => [k.trim().toLowerCase(), String(v).trim().toLowerCase()] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

export type VariantPlan = {
  update: Array<{ id: string; input: VariantInput }>;
  insert: VariantInput[];
  remove: string[];
};

/** Which existing variants each incoming one becomes, which are new, and which were removed. */
export function planVariantSync(existing: Existing[], incoming: VariantInput[]): VariantPlan {
  const live = existing.filter((v) => !v.archived_at);
  const claimed = new Set<string>();
  const plan: VariantPlan = { update: [], insert: [], remove: [] };

  for (const input of incoming) {
    const byId = input.id ? live.find((v) => v.id === input.id && !claimed.has(v.id)) : undefined;
    const match = byId ?? live.find((v) => !claimed.has(v.id) && optionsKey(v.options) === optionsKey(input.options));
    if (match) {
      claimed.add(match.id);
      plan.update.push({ id: match.id, input });
    } else {
      plan.insert.push(input);
    }
  }
  plan.remove = live.filter((v) => !claimed.has(v.id)).map((v) => v.id);
  return plan;
}

const columns = (v: VariantInput) => ({
  options: v.options || {},
  sku: v.sku || null,
  price_override: v.price_override ?? null,
  stock: v.stock ?? 0,
  image_url: v.image_url || null,
  barcode: v.barcode || null,
  weight_kg: v.weight_kg ?? null,
  ...saleColumns(v),
  ...(v.currency_prices !== undefined ? { currency_prices: cleanCurrencyPrices(v.currency_prices) } : {}),
});

/** Only currency codes with a sensible price. */
export function cleanCurrencyPrices(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [code, raw] of Object.entries(value as Record<string, unknown>)) {
    const price = Number(raw);
    if (/^[A-Z]{3}$/.test(code) && Number.isFinite(price) && price > 0 && price < 100_000_000) out[code] = Math.round(price * 100) / 100;
  }
  return out;
}

/** Only the sale fields that were sent (checked beforehand by checkSaleWrite). */
export function saleColumns(v: Pick<VariantInput, "sale_price" | "sale_starts_at" | "sale_ends_at">) {
  const out: { sale_price?: number | null; sale_starts_at?: string | null; sale_ends_at?: string | null } = {};
  if (v.sale_price !== undefined) out.sale_price = v.sale_price;
  if (v.sale_starts_at !== undefined) out.sale_starts_at = v.sale_starts_at;
  if (v.sale_ends_at !== undefined) out.sale_ends_at = v.sale_ends_at;
  return out;
}

/** Applies the plan. Returns the product's variants as they now stand (archived ones left out). */
export async function syncProductVariants(service: ReturnType<typeof createServerSupabaseClient>, productId: string, incoming: VariantInput[]) {
  const db = service.schema("store");
  const { data: existing, error: readError } = await db.from("product_variants").select("id, options, archived_at").eq("product_id", productId);
  if (readError) throw new Error(readError.message);
  const plan = planVariantSync((existing || []) as Existing[], incoming);

  for (const { id, input } of plan.update) {
    // A stock figure the merchant didn't change isn't written; a changed one is added, so sales made meanwhile still count.
    const change = stockChange(input.stock ?? 0, input.stock_was);
    const { stock, ...rest } = columns(input);
    const { error } = await db.from("product_variants").update(change.kind === "set" ? { ...rest, stock } : rest).eq("id", id).eq("product_id", productId);
    if (error) throw new Error(error.message);
    if (change.kind === "add") await addToStock(db, "product_variants", id, change.delta, { product_id: productId });
  }
  if (plan.insert.length) {
    const { error } = await db.from("product_variants").insert(plan.insert.map((v) => ({ product_id: productId, ...columns(v) })));
    if (error) throw new Error(error.message);
  }
  if (plan.remove.length) {
    const { data: ordered } = await db.from("order_items").select("variant_id").in("variant_id", plan.remove);
    const keep = new Set((ordered || []).map((o) => o.variant_id as string));
    const toArchive = plan.remove.filter((id) => keep.has(id));
    const toDelete = plan.remove.filter((id) => !keep.has(id));
    if (toArchive.length) {
      const { error } = await db.from("product_variants").update({ archived_at: new Date().toISOString(), stock: 0 }).in("id", toArchive);
      if (error) throw new Error(error.message);
    }
    if (toDelete.length) {
      const { error } = await db.from("product_variants").delete().in("id", toDelete);
      if (error) throw new Error(error.message);
    }
  }

  const { data: rows, error } = await db.from("product_variants").select("*").eq("product_id", productId).is("archived_at", null);
  if (error) throw new Error(error.message);
  return (rows || []) as StoreProductVariantRow[];
}
