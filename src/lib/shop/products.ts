import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEFAULT_SHOP_CURRENCY } from "@/lib/shop/tenants";
import type { FixedPrices } from "@/lib/store/currencies";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";
import { effectivePrice, saleFromRow, saleIsLive } from "@/lib/store/sale-price";

/** Columns a shopper is allowed to see -- excludes cost_price, supplier/warehouse
 * info, metadata, import/audit fields, and anything else that's merchant-internal.
 * The legacy list is used until the sale price columns have been added. */
const LEGACY_PRODUCT_COLUMNS = `
  id, name, slug, sku, brand, category, subcategory, tags, product_type,
  description, short_description, image_url, image_urls, image_alt_texts,
  product_options, price, compare_at_price, currency, delivery_extra, minimum_order_qty,
  stock, unit, allow_backorder, weight_kg, returnable, return_window_days,
  warranty_text, featured, new_arrival, best_seller, preorder,
  rating_average, rating_count,
  product_variants (id, options, sku, price_override, stock, image_url, barcode, archived_at),
  product_prices (currency, price, compare_at_price)
`;

const SHOP_PRODUCT_COLUMNS = LEGACY_PRODUCT_COLUMNS.replace("compare_at_price, currency,", "compare_at_price, sale_price, sale_starts_at, sale_ends_at, currency,").replace(
  "price_override, stock,",
  "price_override, sale_price, sale_starts_at, sale_ends_at, stock,",
);

/** Whether a query failed only because the sale columns haven't been added yet. */
const missingSaleColumns = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "42703" || /sale_(price|starts_at|ends_at)/.test(error.message || "")));

export type ShopProductVariant = {
  id: string;
  options: Record<string, string>;
  sku: string | null;
  /** The variant's own price right now (its sale price while its sale is on), or null to use the product's. */
  priceOverride: number | null;
  /** The variant's normal price, while its own sale is on. */
  compareAtPrice: number | null;
  /** When the variant's own sale ends, if it's on sale and has an end. */
  saleEndsAt: string | null;
  stock: number;
  imageUrl: string | null;
  barcode: string | null;
};

export type ShopProduct = {
  id: string;
  name: string;
  slug: string | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  productType: "physical" | "digital" | "service" | "subscription";
  description: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  imageAltTexts: string[];
  productOptions: Array<{ name: string; values: string[] }>;
  /** What one costs right now: the sale price while a sale is on. */
  price: number;
  /** Shown struck through: the normal price while on sale, else the merchant's "was" price. */
  compareAtPrice: number | null;
  /** On sale right now (a sale price inside its dates, on a plan with flash sales). */
  onSale: boolean;
  /** When the sale ends, if it's on sale and has an end. */
  saleEndsAt: string | null;
  currency: string;
  /** The merchant's own prices in other currencies (base product only; variants convert). */
  fixedPrices: FixedPrices;
  /** Extra delivery charge per item, on top of the delivery area's fee. */
  deliveryExtra: number;
  minimumOrderQty: number;
  stock: number;
  unit: string;
  allowBackorder: boolean;
  weightKg: number | null;
  returnable: boolean;
  returnWindowDays: number | null;
  warrantyText: string | null;
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  preorder: boolean;
  ratingAverage: number;
  ratingCount: number;
  inStock: boolean;
  variants: ShopProductVariant[];
};

type ShopProductRow = {
  id: string;
  name: string;
  slug: string | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  product_type: ShopProduct["productType"];
  description: string | null;
  short_description: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  image_alt_texts: string[] | null;
  product_options: Array<{ name: string; values: string[] }> | null;
  price: number;
  compare_at_price: number | null;
  sale_price?: number | string | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  currency: string | null;
  delivery_extra: number | null;
  minimum_order_qty: number;
  stock: number;
  unit: string;
  allow_backorder: boolean;
  weight_kg: number | null;
  returnable: boolean;
  return_window_days: number | null;
  warranty_text: string | null;
  featured: boolean;
  new_arrival: boolean;
  best_seller: boolean;
  preorder: boolean;
  rating_average: number;
  rating_count: number;
  product_variants:
    | Array<{
        id: string;
        options: Record<string, string>;
        sku: string | null;
        price_override: number | null;
        sale_price?: number | string | null;
        sale_starts_at?: string | null;
        sale_ends_at?: string | null;
        stock: number;
        image_url: string | null;
        barcode: string | null;
        archived_at: string | null;
      }>
    | null;
  product_prices: Array<{ currency: string; price: number; compare_at_price: number | null }> | null;
};

/**
 * The merchant's own prices in other currencies. They're set for the normal
 * price, so while a sale is on each one is cut by the same share as the home
 * price and shown against its normal price, rather than switching to conversion.
 */
function fixedPricesFor(rows: ShopProductRow["product_prices"], productPrice: { price: number; regular: number; onSale: boolean }): FixedPrices {
  const share = productPrice.onSale && productPrice.regular > 0 ? productPrice.price / productPrice.regular : null;
  return Object.fromEntries(
    (rows || []).map((p) => {
      const price = Number(p.price);
      if (share == null) return [p.currency, { price, compareAt: p.compare_at_price != null ? Number(p.compare_at_price) : null }];
      return [p.currency, { price: Math.round(price * share * 100) / 100, compareAt: price }];
    }),
  );
}

function mapRow(row: ShopProductRow, salesEnabled: boolean, now: Date): ShopProduct {
  const base = { price: Number(row.price) || 0, ...saleFromRow(row) };
  const productPrice = effectivePrice(base, null, now, salesEnabled);
  // Removed variants are kept (archived) for past orders but never offered.
  const variants: ShopProductVariant[] = (row.product_variants || []).filter((v) => !v.archived_at).map((v) => {
    const override = v.price_override == null ? null : Number(v.price_override);
    const sale = saleFromRow(v);
    const own = effectivePrice(base, { priceOverride: override, ...sale }, now, salesEnabled);
    // A variant on its own sale, or with its own price, has its own price; otherwise it follows the product's (sale included).
    const ownSale = salesEnabled && saleIsLive(sale, now) && (sale.salePrice as number) < (override ?? base.price);
    return {
      id: v.id,
      options: v.options || {},
      sku: v.sku,
      priceOverride: ownSale || override != null ? own.price : null,
      compareAtPrice: ownSale ? own.regular : null,
      saleEndsAt: ownSale ? own.saleEndsAt : null,
      stock: v.stock,
      imageUrl: v.image_url,
      barcode: v.barcode,
    };
  });

  const inStock = row.allow_backorder
    ? true
    : variants.length > 0
      ? variants.some((v) => v.stock > 0)
      : row.stock > 0;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    tags: row.tags || [],
    productType: row.product_type,
    description: row.description,
    shortDescription: row.short_description,
    imageUrl: row.image_url,
    imageUrls: row.image_urls || [],
    imageAltTexts: row.image_alt_texts || [],
    productOptions: row.product_options || [],
    price: productPrice.price,
    compareAtPrice: productPrice.onSale ? productPrice.regular : row.compare_at_price != null ? Number(row.compare_at_price) : null,
    onSale: productPrice.onSale,
    saleEndsAt: productPrice.saleEndsAt,
    currency: row.currency || DEFAULT_SHOP_CURRENCY,
    fixedPrices: fixedPricesFor(row.product_prices, productPrice),
    deliveryExtra: Number(row.delivery_extra) || 0,
    minimumOrderQty: row.minimum_order_qty,
    stock: row.stock,
    unit: row.unit,
    allowBackorder: row.allow_backorder,
    weightKg: row.weight_kg,
    returnable: row.returnable,
    returnWindowDays: row.return_window_days,
    warrantyText: row.warranty_text,
    featured: row.featured,
    newArrival: row.new_arrival,
    bestSeller: row.best_seller,
    preorder: row.preorder,
    ratingAverage: Number(row.rating_average) || 0,
    ratingCount: row.rating_count,
    inStock,
    variants,
  };
}

export const SHOP_PRODUCT_SORTS = ["newest", "featured", "price-asc", "price-desc", "rating"] as const;
export type ShopProductSort = (typeof SHOP_PRODUCT_SORTS)[number];

const SORTS: Record<ShopProductSort, { column: string; ascending: boolean }> = {
  newest: { column: "created_at", ascending: false },
  featured: { column: "featured", ascending: false },
  "price-asc": { column: "price", ascending: true },
  "price-desc": { column: "price", ascending: false },
  rating: { column: "rating_average", ascending: false },
};

export type ShopProductFilters = {
  category?: string;
  search?: string;
  /** Merchandising flag set on the product in the dashboard. */
  flag?: "featured" | "new-arrival" | "best-seller" | "on-sale";
  collectionId?: string;
  sort?: ShopProductSort;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 24;

export async function listShopProducts(
  tenantId: string,
  filters: ShopProductFilters = {},
): Promise<{ products: ShopProduct[]; total: number; page: number; pageSize: number }> {
  const supabase = createServerSupabaseClient();
  const page = Math.max(1, filters.page || 1);
  const pageSize = filters.pageSize || DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let productIds: string[] | null = null;
  if (filters.collectionId) {
    const { data: members, error: membersError } = await supabase
      .schema("store")
      .from("collection_products")
      .select("product_id")
      .eq("collection_id", filters.collectionId)
      .order("position");
    if (membersError) throw new Error(membersError.message);
    productIds = (members || []).map((m) => m.product_id as string);
    if (productIds.length === 0) return { products: [], total: 0, page, pageSize };
  }

  // Price sorts go by today's price, sale included, which the database can't
  // work out: fetch the matches (a shop's catalogue, up to a limit), sort here, then page.
  const byPrice = filters.sort === "price-asc" || filters.sort === "price-desc";
  // "On sale" is also decided here (sale windows, sale below price), so it pages after filtering too.
  const fetchAll = byPrice || filters.flag === "on-sale";
  const PRICE_SORT_LIMIT = 2000;

  const run = (withSales: boolean) => {
    let query = supabase
      .schema("store")
      .from("products")
      .select(withSales ? SHOP_PRODUCT_COLUMNS : LEGACY_PRODUCT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .eq("visibility", "visible")
      .eq("approval_status", "approved");

    if (productIds) query = query.in("id", productIds);
    if (filters.category) query = query.eq("category", filters.category);
    if (filters.search) query = query.ilike("name", `%${filters.search}%`);
    if (filters.flag === "featured") query = query.eq("featured", true);
    if (filters.flag === "new-arrival") query = query.eq("new_arrival", true);
    if (filters.flag === "best-seller") query = query.eq("best_seller", true);
    // PostgREST can't compare two columns, so "on sale" narrows to products with a
    // compare-at or sale price here and drops any not actually discounted below.
    if (filters.flag === "on-sale") query = withSales ? query.or("compare_at_price.not.is.null,sale_price.not.is.null") : query.not("compare_at_price", "is", null);

    const sort = SORTS[filters.sort ?? "newest"];
    query = query.order(sort.column, { ascending: sort.ascending });
    if (sort.column !== "created_at") query = query.order("created_at", { ascending: false });
    return fetchAll ? query.range(0, PRICE_SORT_LIMIT - 1) : query.range(from, to);
  };

  let result = await run(true);
  if (missingSaleColumns(result.error)) result = await run(false);
  const { data, error, count } = result;
  if (error) throw new Error(error.message);

  let products = await mapRows(tenantId, (data || []) as unknown as ShopProductRow[]);
  if (filters.flag === "on-sale") products = products.filter((p) => p.compareAtPrice != null && p.compareAtPrice > p.price);
  let total = count || 0;
  if (fetchAll) {
    if (byPrice) {
      // p.price is today's price: the sale price while a sale runs.
      const direction = filters.sort === "price-asc" ? 1 : -1;
      products = products.sort((a, b) => (a.price - b.price) * direction);
    }
    if (filters.flag === "on-sale") total = products.length;
    products = products.slice(from, to + 1);
  }

  return {
    products,
    total,
    page,
    pageSize,
  };
}

/** Distinct categories of a store's visible products, with how many products each has. */
export async function listShopCategories(tenantId: string): Promise<Array<{ name: string; count: number }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("store")
    .from("products")
    .select("category")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .eq("visibility", "visible")
    .eq("approval_status", "approved")
    .not("category", "is", null)
    .limit(2000);
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of data || []) {
    const name = String(row.category).trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getShopProductBySlug(tenantId: string, slug: string): Promise<ShopProduct | null> {
  const supabase = createServerSupabaseClient();

  let columns = SHOP_PRODUCT_COLUMNS;
  const lookup = (column: "slug" | "id") =>
    supabase
      .schema("store")
      .from("products")
      .select(columns)
      .eq("tenant_id", tenantId)
      .eq(column, slug)
      .eq("status", "active")
      .eq("visibility", "visible")
      .eq("approval_status", "approved")
      .maybeSingle();

  let { data, error } = await lookup("slug");
  if (missingSaleColumns(error)) {
    columns = LEGACY_PRODUCT_COLUMNS;
    ({ data, error } = await lookup("slug"));
  }
  // Products without a slug are linked by id (see ProductCard), so fall back to that.
  if (!data && !error && UUID_PATTERN.test(slug)) ({ data, error } = await lookup("id"));

  if (error) throw new Error(error.message);
  if (!data) return null;

  return (await mapRows(tenantId, [data as unknown as ShopProductRow]))[0];
}

/** Products on sale in the shop, by id (e.g. to put a saved basket back). Ones no longer on sale are left out. */
export async function getShopProductsByIds(tenantId: string, ids: string[]): Promise<ShopProduct[]> {
  const wanted = [...new Set(ids.filter((id) => UUID_PATTERN.test(id)))];
  if (!wanted.length) return [];
  const supabase = createServerSupabaseClient();
  const lookup = (columns: string) =>
    supabase
      .schema("store")
      .from("products")
      .select(columns)
      .eq("tenant_id", tenantId)
      .in("id", wanted)
      .eq("status", "active")
      .eq("visibility", "visible")
      .eq("approval_status", "approved");

  let { data, error } = await lookup(SHOP_PRODUCT_COLUMNS);
  if (missingSaleColumns(error)) ({ data, error } = await lookup(LEGACY_PRODUCT_COLUMNS));
  if (error) throw new Error(error.message);
  return mapRows(tenantId, (data || []) as unknown as ShopProductRow[]);
}

/** Maps rows for the shop, with sale prices applied when the shop's plan includes flash sales. */
async function mapRows(tenantId: string, rows: ShopProductRow[]) {
  const hasSale = rows.some((r) => r.sale_price != null || (r.product_variants || []).some((v) => v.sale_price != null));
  const salesEnabled = hasSale ? storeHasFeature(await getStorePlan(tenantId), "flashSales") : false;
  const now = new Date();
  return rows.map((row) => mapRow(row, salesEnabled, now));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
