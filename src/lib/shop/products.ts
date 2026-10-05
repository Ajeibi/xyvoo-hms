import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEFAULT_SHOP_CURRENCY } from "@/lib/shop/tenants";

/** Columns a shopper is allowed to see -- excludes cost_price, supplier/warehouse
 * info, metadata, import/audit fields, and anything else that's merchant-internal. */
const SHOP_PRODUCT_COLUMNS = `
  id, name, slug, sku, brand, category, subcategory, tags, product_type,
  description, short_description, image_url, image_urls, image_alt_texts,
  product_options, price, compare_at_price, currency, minimum_order_qty,
  stock, unit, allow_backorder, weight_kg, returnable, return_window_days,
  warranty_text, featured, new_arrival, best_seller, preorder,
  rating_average, rating_count,
  product_variants (id, options, sku, price_override, stock, image_url, barcode)
`;

export type ShopProductVariant = {
  id: string;
  options: Record<string, string>;
  sku: string | null;
  priceOverride: number | null;
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
  price: number;
  compareAtPrice: number | null;
  currency: string;
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
  currency: string | null;
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
        stock: number;
        image_url: string | null;
        barcode: string | null;
      }>
    | null;
};

function mapRow(row: ShopProductRow): ShopProduct {
  const variants: ShopProductVariant[] = (row.product_variants || []).map((v) => ({
    id: v.id,
    options: v.options || {},
    sku: v.sku,
    priceOverride: v.price_override,
    stock: v.stock,
    imageUrl: v.image_url,
    barcode: v.barcode,
  }));

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
    price: Number(row.price) || 0,
    compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : null,
    currency: row.currency || DEFAULT_SHOP_CURRENCY,
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

  let query = supabase
    .schema("store")
    .from("products")
    .select(SHOP_PRODUCT_COLUMNS, { count: "exact" })
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
  // compare-at price here and drops any not actually discounted below.
  if (filters.flag === "on-sale") query = query.not("compare_at_price", "is", null);

  const sort = SORTS[filters.sort ?? "newest"];
  query = query.order(sort.column, { ascending: sort.ascending });
  if (sort.column !== "created_at") query = query.order("created_at", { ascending: false });

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  let products = ((data || []) as unknown as ShopProductRow[]).map(mapRow);
  if (filters.flag === "on-sale") products = products.filter((p) => p.compareAtPrice != null && p.compareAtPrice > p.price);

  return {
    products,
    total: count || 0,
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

  const lookup = (column: "slug" | "id") =>
    supabase
      .schema("store")
      .from("products")
      .select(SHOP_PRODUCT_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq(column, slug)
      .eq("status", "active")
      .eq("visibility", "visible")
      .eq("approval_status", "approved")
      .maybeSingle();

  let { data, error } = await lookup("slug");
  // Products without a slug are linked by id (see ProductCard), so fall back to that.
  if (!data && !error && UUID_PATTERN.test(slug)) ({ data, error } = await lookup("id"));

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapRow(data as unknown as ShopProductRow);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
