import { z } from "zod";

/*
 * The dashboard product list on the server: search, filters, sorting and
 * pages, plus the bulk actions and "duplicate" that work on it. Pure helpers
 * only, so they can be tested without a database.
 */

export const PRODUCTS_PAGE_SIZE = 25;

/** The most products one bulk action can change at once. */
export const MAX_BULK_PRODUCTS = 200;

export const PRODUCT_SORTS = {
  newest: { column: "created_at", ascending: false, label: "Newest first" },
  oldest: { column: "created_at", ascending: true, label: "Oldest first" },
  "name-asc": { column: "name", ascending: true, label: "Name, A to Z" },
  "name-desc": { column: "name", ascending: false, label: "Name, Z to A" },
  "price-asc": { column: "price", ascending: true, label: "Price, lowest first" },
  "price-desc": { column: "price", ascending: false, label: "Price, highest first" },
  "stock-asc": { column: "stock", ascending: true, label: "Fewest in stock first" },
  "stock-desc": { column: "stock", ascending: false, label: "Most in stock first" },
  updated: { column: "updated_at", ascending: false, label: "Recently changed" },
} as const;

export type ProductSort = keyof typeof PRODUCT_SORTS;

/**
 * Stock filter values, and the generated store.products.stock_state value each
 * one matches (see migration 20261017120000_store_catalogue_phase1.sql). The
 * same rule as DashboardProduct.stockStatus: 0 or fewer is sold out, at or
 * below the warning level is running low.
 */
export const STOCK_FILTERS = {
  "in-stock": "in",
  "low-stock": "low",
  "out-of-stock": "out",
} as const;

export type StockFilter = keyof typeof STOCK_FILTERS;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const productListQuerySchema = z.object({
  q: optionalText(100),
  status: z.enum(["active", "draft", "archived"]).optional().catch(undefined),
  stock: z.enum(["in-stock", "low-stock", "out-of-stock"]).optional().catch(undefined),
  category: optionalText(120),
  collection: z.string().uuid().optional().catch(undefined),
  sort: z.enum(Object.keys(PRODUCT_SORTS) as [ProductSort, ...ProductSort[]]).catch("newest").default("newest"),
  /** Absent means "every product", which the Home page, discounts and delivery rules rely on. */
  page: z.coerce.number().int().min(1).max(100_000).optional().catch(1),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

/** Reads the list filters from a request's search params. Unknown or broken values fall back to defaults. */
export function parseProductListQuery(params: URLSearchParams): ProductListQuery {
  const raw: Record<string, string> = {};
  for (const key of ["q", "status", "stock", "category", "collection", "sort", "page"]) {
    const value = params.get(key);
    if (value != null && value !== "") raw[key] = value;
  }
  const parsed = productListQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : { q: undefined, category: undefined, sort: "newest" };
}

/**
 * Makes a search term safe to put inside a PostgREST `or=(...)` filter: drops
 * the characters that filter syntax gives meaning to (commas, brackets,
 * quotes, wildcards, backslashes and colons) and squashes spaces.
 */
export function cleanSearchTerm(term: string) {
  return term
    .replace(/[,()"'\\*%:{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * The PostgREST `or` filter for a search: product name, stock code or
 * category containing the term, a tag equal to it (as typed or lower case),
 * or one of the given products (those with an option whose stock code
 * matches). Null when there's nothing left to search for.
 */
export function buildSearchFilter(term: string, extraProductIds: string[] = []) {
  const clean = cleanSearchTerm(term);
  if (!clean) return null;
  const parts = [`name.ilike.%${clean}%`, `sku.ilike.%${clean}%`, `category.ilike.%${clean}%`, `tags.cs.{${clean}}`];
  const lower = clean.toLowerCase();
  if (lower !== clean) parts.push(`tags.cs.{${lower}}`);
  const ids = extraProductIds.filter((id) => z.string().uuid().safeParse(id).success);
  if (ids.length) parts.push(`id.in.(${ids.join(",")})`);
  return parts.join(",");
}

export function pageRange(page: number, pageSize = PRODUCTS_PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

const money = z.coerce.number().finite().min(0, "Prices can't be below zero.").max(1_000_000_000, "That amount is too large.");

export const bulkActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("price"),
    mode: z.enum(["set", "increase-percent", "decrease-percent", "increase-amount", "decrease-amount"]),
    value: money,
  }),
  z.object({ type: z.literal("stock"), value: z.coerce.number().int("Use a whole number for stock.").min(0, "Stock can't be below zero.").max(10_000_000) }),
  z.object({ type: z.literal("status"), value: z.enum(["active", "draft", "archived"]) }),
  z.object({
    type: z.literal("category"),
    value: z
      .string()
      .trim()
      .max(120)
      .transform((v) => v || null)
      .nullable(),
  }),
  z.object({ type: z.literal("collection"), op: z.enum(["add", "remove"]), collectionId: z.string().uuid("Choose a collection.") }),
  z.object({ type: z.literal("delete") }),
]);

export type BulkAction = z.infer<typeof bulkActionSchema>;

export const bulkRequestSchema = z.object({
  slug: z.string().min(1),
  ids: z
    .array(z.string().uuid())
    .min(1, "Choose at least one product.")
    .max(MAX_BULK_PRODUCTS, `You can change up to ${MAX_BULK_PRODUCTS} products at a time.`)
    .transform((ids) => [...new Set(ids)]),
  action: bulkActionSchema,
});

/** The new price after a bulk price change, rounded to kobo/pence and never below zero. */
export function applyPriceChange(price: number, action: Extract<BulkAction, { type: "price" }>) {
  const current = Number(price) || 0;
  let next: number;
  switch (action.mode) {
    case "set":
      next = action.value;
      break;
    case "increase-percent":
      next = current * (1 + action.value / 100);
      break;
    case "decrease-percent":
      next = current * (1 - action.value / 100);
      break;
    case "increase-amount":
      next = current + action.value;
      break;
    case "decrease-amount":
      next = current - action.value;
      break;
  }
  return Math.max(0, Math.round(next * 100) / 100);
}

/** Groups products by their new price, so a bulk change needs one update per distinct price rather than per product. */
export function groupByNewPrice(products: Array<{ id: string; price: number }>, action: Extract<BulkAction, { type: "price" }>) {
  const groups = new Map<number, string[]>();
  for (const p of products) {
    const next = applyPriceChange(p.price, action);
    groups.set(next, [...(groups.get(next) || []), p.id]);
  }
  return groups;
}

/** A plain sentence for what a bulk action did, for the status message. */
export function describeBulkResult(action: BulkAction, count: number) {
  const things = `${count} ${count === 1 ? "product" : "products"}`;
  switch (action.type) {
    case "price":
      return `Updated the price of ${things}.`;
    case "stock":
      return `Set the stock of ${things} to ${action.value}.`;
    case "status":
      return `Marked ${things} as ${action.value}.`;
    case "category":
      return action.value ? `Moved ${things} to ${action.value}.` : `Removed the category from ${things}.`;
    case "collection":
      return action.op === "add" ? `Added ${things} to the collection.` : `Removed ${things} from the collection.`;
    case "delete":
      return `Deleted ${things}.`;
  }
}

// ---------------------------------------------------------------------------
// Duplicating a product
// ---------------------------------------------------------------------------

/** A readable web link from a product name: "Ankara Dress (Red)" becomes "ankara-dress-red". */
export function slugifyProductName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** The first of base, base-2, base-3… that isn't already taken. */
export function uniqueSlug(base: string, taken: Set<string>) {
  const root = base || "product";
  let candidate = root;
  let n = 2;
  while (taken.has(candidate)) candidate = `${root}-${n++}`;
  return candidate;
}

/** The web link for a copy: "red-dress" becomes "red-dress-copy", then "red-dress-copy-2" and so on. */
export function copySlug(original: string | null, name: string, taken: Set<string>) {
  const base = (original || slugifyProductName(name) || "product").slice(0, 74);
  return uniqueSlug(`${base}-copy`, taken);
}

/** Fields that identify one physical product, so a copy starts without them. */
const CLEARED_ON_COPY = new Set(["sku", "barcode", "gtin", "published_at", "import_source", "import_batch_id"]);

/**
 * The insert for a copy of a product: every writable field, with a new web
 * link, "(copy)" on the name, the stock code and barcodes cleared, and saved
 * as a draft so it doesn't go on sale by surprise.
 */
export function buildDuplicateProduct(
  row: Record<string, unknown>,
  writableFields: readonly string[],
  tenantId: string,
  takenSlugs: Set<string>,
) {
  const copy: Record<string, unknown> = {};
  for (const field of writableFields) {
    if (Object.prototype.hasOwnProperty.call(row, field) && !CLEARED_ON_COPY.has(field)) copy[field] = row[field];
  }
  const name = String(row.name ?? "").trim() || "Product";
  return {
    ...copy,
    tenant_id: tenantId,
    name: `${name} (copy)`.slice(0, 200),
    slug: copySlug(typeof row.slug === "string" ? row.slug : null, name, takenSlugs),
    sku: null,
    barcode: null,
    gtin: null,
    status: "draft",
    published_at: null,
  };
}

/** A product's options copied onto the new product, with their own stock codes and barcodes cleared. */
export function buildDuplicateVariants(
  variants: Array<{ options: Record<string, string>; price_override: number | null; stock: number; image_url: string | null; weight_kg: number | null; archived_at?: string | null }>,
  productId: string,
) {
  return variants
    .filter((v) => !v.archived_at)
    .map((v) => ({
      product_id: productId,
      options: v.options || {},
      sku: null,
      barcode: null,
      price_override: v.price_override,
      stock: v.stock ?? 0,
      image_url: v.image_url,
      weight_kg: v.weight_kg,
    }));
}
