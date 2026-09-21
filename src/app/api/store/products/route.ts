import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext } from "@/lib/store/access";
import { mapProductRowToDashboard, pickWritableProductFields, type StoreProductRow } from "@/lib/store/products";

type VariantInput = {
  options: Record<string, string>;
  sku?: string;
  price_override?: number;
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
  const { data: product, error } = await service
    .schema("store")
    .from("products")
    .insert({
      ...pickWritableProductFields(body),
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
        })),
      )
      .select("*");

    if (variantError) {
      return NextResponse.json({ error: variantError.message }, { status: 400 });
    }
    insertedVariants = variantRows || [];
  }

  const row = { ...product, product_variants: insertedVariants } as StoreProductRow;
  return NextResponse.json({ product: mapProductRowToDashboard(row) }, { status: 201 });
}
