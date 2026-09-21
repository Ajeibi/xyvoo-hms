import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";
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

type UpdateProductBody = {
  tenantSlug?: string;
  variants?: VariantInput[];
  [key: string]: unknown;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as UpdateProductBody | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const slug = body.tenantSlug || "";
  if (!slug) return NextResponse.json({ error: "Missing tenantSlug." }, { status: 400 });

  const access = await getStoreAccessContext(slug);
  if (!access.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.tenantId || !access.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServerSupabaseClient();
  const updates = pickWritableProductFields(body);

  const { data: product, error } = await service
    .schema("store")
    .from("products")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", access.tenantId)
    .select("*")
    .single();

  if (error || !product) {
    return NextResponse.json({ error: error?.message || "Product not found." }, { status: 404 });
  }

  if (Object.keys(updates).length) {
    await service.schema("store").from("product_audit_log").insert({
      tenant_id: access.tenantId,
      product_id: id,
      user_id: access.userId,
      changed_fields: updates,
    });
  }

  let variantRows: StoreProductRow["product_variants"] = [];

  if (Array.isArray(body.variants)) {
    await service.schema("store").from("product_variants").delete().eq("product_id", id);

    if (body.variants.length) {
      const { data: inserted, error: variantError } = await service
        .schema("store")
        .from("product_variants")
        .insert(
          body.variants.map((variant) => ({
            product_id: id,
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

      if (variantError) return NextResponse.json({ error: variantError.message }, { status: 400 });
      variantRows = inserted || [];
    }
  } else {
    const { data: existing } = await service
      .schema("store")
      .from("product_variants")
      .select("*")
      .eq("product_id", id);
    variantRows = existing || [];
  }

  const row = { ...product, product_variants: variantRows } as StoreProductRow;
  return NextResponse.json({ product: mapProductRowToDashboard(row) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const access = await getStoreAccessContext(slug);
  if (!access.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.tenantId || !access.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!getStoreCapabilities(access.role).canDeleteProducts) {
    return NextResponse.json({ error: "Only an owner or admin can delete products." }, { status: 403 });
  }

  const service = createServerSupabaseClient();
  const { error } = await service
    .schema("store")
    .from("products")
    .delete()
    .eq("id", id)
    .eq("tenant_id", access.tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
