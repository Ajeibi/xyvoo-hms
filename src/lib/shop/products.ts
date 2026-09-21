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

export type ShopProductFilters = {
  category?: string;
  search?: string;
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

  let query = supabase
    .schema("store")
    .from("products")
    .select(SHOP_PRODUCT_COLUMNS, { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .eq("visibility", "visible")
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    products: ((data || []) as unknown as ShopProductRow[]).map(mapRow),
    total: count || 0,
    page,
    pageSize,
  };
}

export async function getShopProductBySlug(tenantId: string, slug: string): Promise<ShopProduct | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .schema("store")
    .from("products")
    .select(SHOP_PRODUCT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .eq("status", "active")
    .eq("visibility", "visible")
    .eq("approval_status", "approved")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapRow(data as unknown as ShopProductRow);
}
