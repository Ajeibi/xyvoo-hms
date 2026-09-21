export type StoreProductVariantRow = {
  id: string;
  product_id: string;
  options: Record<string, string>;
  sku: string | null;
  price_override: number | null;
  stock: number;
  image_url: string | null;
  barcode: string | null;
  weight_kg: number | null;
};

export type StoreProductRow = {
  id: string;
  tenant_id: string;

  // Identity
  name: string;
  slug: string | null;
  sku: string | null;
  barcode: string | null;
  gtin: string | null;
  mpn: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  product_type: "physical" | "digital" | "service" | "subscription";
  status: "draft" | "active" | "archived";
  visibility: "visible" | "hidden" | "scheduled";
  condition: "new" | "used" | "refurbished";

  // Content
  description: string | null;
  short_description: string | null;
  image_url: string | null;
  image_urls: string[];
  image_alt_texts: string[];
  video_urls: string[];
  product_options: Array<{ name: string; values: string[] }>;

  // Pricing & profit
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  currency: string | null;
  taxable: boolean;
  tax_class: string | null;
  minimum_order_qty: number;

  // Inventory
  stock: number;
  reorder_level: number;
  unit: string;
  allow_backorder: boolean;
  supplier_name: string | null;
  warehouse_location: string | null;

  // Shipping
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  dimensions_unit: string;
  country_of_origin: string | null;
  hs_code: string | null;

  // Returns & warranty
  returnable: boolean;
  return_window_days: number | null;
  warranty_text: string | null;

  // SEO
  meta_title: string | null;
  meta_description: string | null;
  structured_data_type: string;

  // Merchandising
  featured: boolean;
  new_arrival: boolean;
  best_seller: boolean;

  // Publishing
  published_at: string | null;
  discontinue_at: string | null;
  preorder: boolean;
  preorder_available_date: string | null;
  approval_status: "draft" | "pending_review" | "approved";

  // Traceability
  serial_tracked: boolean;
  batch_tracked: boolean;
  import_source: string | null;
  import_batch_id: string | null;

  // Computed / read-only
  view_count: number;
  wishlist_count: number;
  rating_average: number;
  rating_count: number;

  // System
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  product_variants?: StoreProductVariantRow[];
};

export type DashboardProduct = {
  id: string;
  name: string;
  slug: string | null;
  sku: string | null;
  barcode: string | null;
  gtin: string | null;
  mpn: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  productType: StoreProductRow["product_type"];
  status: StoreProductRow["status"];
  visibility: StoreProductRow["visibility"];
  condition: StoreProductRow["condition"];

  description: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  imageAltTexts: string[];
  videoUrls: string[];
  productOptions: Array<{ name: string; values: string[] }>;

  sellingPrice: number;
  compareAtPrice: number | null;
  costPrice: number;
  currency: string | null;
  taxable: boolean;
  taxClass: string | null;
  minimumOrderQty: number;

  stock: number;
  reorderLevel: number;
  unit: string;
  allowBackorder: boolean;
  supplierName: string | null;
  warehouseLocation: string | null;

  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  dimensionsUnit: string;
  countryOfOrigin: string | null;
  hsCode: string | null;

  returnable: boolean;
  returnWindowDays: number | null;
  warrantyText: string | null;

  metaTitle: string | null;
  metaDescription: string | null;
  structuredDataType: string;

  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;

  publishedAt: string | null;
  discontinueAt: string | null;
  preorder: boolean;
  preorderAvailableDate: string | null;
  approvalStatus: StoreProductRow["approval_status"];

  serialTracked: boolean;
  batchTracked: boolean;
  importSource: string | null;

  viewCount: number;
  wishlistCount: number;
  ratingAverage: number;
  ratingCount: number;

  // Computed for dashboard display
  profit: number;
  profitMargin: number;
  stockStatus: "in-stock" | "low-stock" | "out-of-stock";

  variants: StoreProductVariantRow[];
  createdAt: string;
  updatedAt: string;
};

/** Whitelisted fields accepted from product create/update request bodies. */
export const WRITABLE_PRODUCT_FIELDS = [
  // Identity
  "name",
  "slug",
  "sku",
  "barcode",
  "gtin",
  "mpn",
  "brand",
  "category",
  "subcategory",
  "tags",
  "product_type",
  "status",
  "visibility",
  "condition",

  // Content
  "description",
  "short_description",
  "image_url",
  "image_urls",
  "image_alt_texts",
  "video_urls",
  "product_options",

  // Pricing & profit
  "price",
  "compare_at_price",
  "cost_price",
  "currency",
  "taxable",
  "tax_class",
  "minimum_order_qty",

  // Inventory
  "stock",
  "reorder_level",
  "unit",
  "allow_backorder",
  "supplier_name",
  "warehouse_location",

  // Shipping
  "weight_kg",
  "length_cm",
  "width_cm",
  "height_cm",
  "dimensions_unit",
  "country_of_origin",
  "hs_code",

  // Returns & warranty
  "returnable",
  "return_window_days",
  "warranty_text",

  // SEO
  "meta_title",
  "meta_description",
  "structured_data_type",

  // Merchandising
  "featured",
  "new_arrival",
  "best_seller",

  // Publishing
  "published_at",
  "discontinue_at",
  "preorder",
  "preorder_available_date",
  "approval_status",

  // Traceability
  "serial_tracked",
  "batch_tracked",
  "import_source",
  "import_batch_id",

  // System
  "metadata",
] as const;

export function mapProductRowToDashboard(row: StoreProductRow): DashboardProduct {
  const price = Number(row.price) || 0;
  const costPrice = Number(row.cost_price) || 0;
  const profit = price - costPrice;
  const profitMargin = price > 0 ? (profit / price) * 100 : 0;

  const stockStatus: DashboardProduct["stockStatus"] =
    row.stock <= 0 ? "out-of-stock" : row.stock <= row.reorder_level ? "low-stock" : "in-stock";

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    barcode: row.barcode,
    gtin: row.gtin,
    mpn: row.mpn,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    tags: row.tags || [],
    productType: row.product_type,
    status: row.status,
    visibility: row.visibility,
    condition: row.condition,

    description: row.description,
    shortDescription: row.short_description,
    imageUrl: row.image_url,
    imageUrls: row.image_urls || [],
    imageAltTexts: row.image_alt_texts || [],
    videoUrls: row.video_urls || [],
    productOptions: row.product_options || [],

    sellingPrice: price,
    compareAtPrice: row.compare_at_price,
    costPrice,
    currency: row.currency,
    taxable: row.taxable,
    taxClass: row.tax_class,
    minimumOrderQty: row.minimum_order_qty,

    stock: row.stock,
    reorderLevel: row.reorder_level,
    unit: row.unit,
    allowBackorder: row.allow_backorder,
    supplierName: row.supplier_name,
    warehouseLocation: row.warehouse_location,

    weightKg: row.weight_kg,
    lengthCm: row.length_cm,
    widthCm: row.width_cm,
    heightCm: row.height_cm,
    dimensionsUnit: row.dimensions_unit,
    countryOfOrigin: row.country_of_origin,
    hsCode: row.hs_code,

    returnable: row.returnable,
    returnWindowDays: row.return_window_days,
    warrantyText: row.warranty_text,

    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    structuredDataType: row.structured_data_type,

    featured: row.featured,
    newArrival: row.new_arrival,
    bestSeller: row.best_seller,

    publishedAt: row.published_at,
    discontinueAt: row.discontinue_at,
    preorder: row.preorder,
    preorderAvailableDate: row.preorder_available_date,
    approvalStatus: row.approval_status,

    serialTracked: row.serial_tracked,
    batchTracked: row.batch_tracked,
    importSource: row.import_source,

    viewCount: row.view_count,
    wishlistCount: row.wishlist_count,
    ratingAverage: row.rating_average,
    ratingCount: row.rating_count,

    profit,
    profitMargin,
    stockStatus,

    variants: row.product_variants || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function pickWritableProductFields(body: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const field of WRITABLE_PRODUCT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      result[field] = body[field];
    }
  }
  return result;
}
