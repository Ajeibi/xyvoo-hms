import { copyProductImages, hasExternalImages } from "@/lib/store/external-images";
import { shopChanged } from "@/lib/store/site/shop-changed";
import { after, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext } from "@/lib/store/access";
import { logActivity } from "@/lib/store/activity";
import { mapProductRowToDashboard, pickWritableProductFields, type StoreProductRow } from "@/lib/store/products";
import { checkPricingWrite, withCheckedPricing } from "@/lib/store/sale-price-server";
import { saleColumns } from "@/lib/store/variants";

type VariantInput = {
  options: Record<string, string>;
  sku?: string;
  price_override?: number;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  stock?: number;
  image_url?: string;
  barcode?: string;
  weight_kg?: number;
};

type CreateProductBody = {
  tenantSlug?: string;
  name?: string;
  price?: number;
  variants?: VariantInput[];
  [key: string]: unknown;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as CreateProductBody | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const slug = body.tenantSlug || "";
  if (!slug) return NextResponse.json({ error: "Missing tenantSlug." }, { status: 400 });

  const access = await getStoreAccessContext(slug);
  if (!access.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.tenantId || !access.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!body.name || typeof body.price !== "number") {
    return NextResponse.json({ error: "Name and price are required." }, { status: 400 });
  }

  const service = createServerSupabaseClient();
  // Sale price and dates (Standard plan) and tax class are checked before anything is written.
  const pricing = await checkPricingWrite(service, access.tenantId, body, null);
  if (pricing.error) return pricing.error;
  if (pricing.variants) body.variants = pricing.variants;
  const { data: product, error } = await service
    .schema("store")
    .from("products")
    .insert({
      ...withCheckedPricing(pickWritableProductFields(body), pricing.fields),
      tenant_id: access.tenantId,
    })
    .select("*")
    .single();

  if (error || !product) {
    return NextResponse.json({ error: error?.message || "Failed to create product." }, { status: 400 });
  }

  const variants = Array.isArray(body.variants) ? body.variants : [];
  let insertedVariants: StoreProductRow["product_variants"] = [];

  if (variants.length) {
    const { data: variantRows, error: variantError } = await service
      .schema("store")
      .from("product_variants")
      .insert(
        variants.map((variant) => ({
          product_id: product.id,
          options: variant.options || {},
          sku: variant.sku || null,
          price_override: variant.price_override ?? null,
          stock: variant.stock ?? 0,
          image_url: variant.image_url || null,
          barcode: variant.barcode || null,
          weight_kg: variant.weight_kg ?? null,
          ...saleColumns(variant),
        })),
      )
      .select("*");

    if (variantError) {
      return NextResponse.json({ error: variantError.message }, { status: 400 });
    }
    insertedVariants = variantRows || [];
  }

  await logActivity({ tenantId: access.tenantId, actor: access, area: "products", action: "created", targetId: product.id, targetLabel: product.name });

  const row = { ...product, product_variants: insertedVariants } as StoreProductRow;
  // Photos added by address are copied into the shop's storage after the reply, so they can be resized for shoppers.
  if (hasExternalImages(row)) {
    const tenantId = access.tenantId;
    after(() => copyProductImages(tenantId, [row.id]));
  }
  shopChanged(access.tenantId);
  return NextResponse.json({ product: mapProductRowToDashboard(row) }, { status: 201 });
}
