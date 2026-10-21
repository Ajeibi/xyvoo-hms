import { copyProductImages, hasExternalImages } from "@/lib/store/external-images";
import { shopChanged } from "@/lib/store/site/shop-changed";
import { after, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";
import { diffFields, logActivity, readBefore } from "@/lib/store/activity";
import { mapProductRowToDashboard, pickWritableProductFields, type StoreProductRow } from "@/lib/store/products";
import { syncProductVariants, type VariantInput } from "@/lib/store/variants";
import { checkPricingWrite, withCheckedPricing } from "@/lib/store/sale-price-server";
import { sendStockAlertsForProducts } from "@/lib/store/stock-alerts";

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
  // Sale price and dates (Standard plan) and tax class are checked before anything is written.
  const pricing = await checkPricingWrite(service, access.tenantId, body, id);
  if (pricing.error) return pricing.error;
  const updates = withCheckedPricing(pickWritableProductFields(body), pricing.fields);
  if (pricing.variants) body.variants = pricing.variants;
  // For the activity log: what the changed fields were before this edit.
  const before = await readBefore("products", access.tenantId, id, [...new Set(["name", ...Object.keys(updates)])]);

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
    await logActivity({
      tenantId: access.tenantId,
      actor: access,
      area: "products",
      action: "updated",
      targetId: id,
      targetLabel: String(product.name ?? before?.name ?? ""),
      changes: diffFields(before, updates),
    });
  }

  let variantRows: StoreProductRow["product_variants"] = [];

  if (Array.isArray(body.variants)) {
    // Updated in place, not deleted and re-created, so orders and baskets keep their variant.
    try {
      variantRows = await syncProductVariants(service, id, body.variants);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save the variants." }, { status: 400 });
    }
  } else {
    const { data: existing } = await service
      .schema("store")
      .from("product_variants")
      .select("*")
      .eq("product_id", id)
      .is("archived_at", null);
    variantRows = existing || [];
  }

  const row = { ...product, product_variants: variantRows } as StoreProductRow;
  // Back in stock? Tell anyone who asked (never holds up the save).
  const tenantId = access.tenantId;
  after(() => sendStockAlertsForProducts(tenantId, [id]));
  // Photos added by address are copied into the shop's storage, so they can be resized for shoppers.
  if (hasExternalImages(row)) after(() => copyProductImages(tenantId, [id]));
  shopChanged(access.tenantId);
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
  const { data: deleted, error } = await service
    .schema("store")
    .from("products")
    .delete()
    .eq("id", id)
    .eq("tenant_id", access.tenantId)
    .select("id, name");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (deleted?.length) {
    await logActivity({ tenantId: access.tenantId, actor: access, area: "products", action: "deleted", targetId: id, targetLabel: deleted[0].name });
  }
  shopChanged(access.tenantId);
  return NextResponse.json({ success: true });
}
