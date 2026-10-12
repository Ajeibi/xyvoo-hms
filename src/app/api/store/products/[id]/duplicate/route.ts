import { NextResponse } from "next/server";
import { productNotFound, resolveStoreRequest } from "@/lib/store/api-helpers";
import { buildDuplicateProduct, buildDuplicateVariants } from "@/lib/store/product-catalogue";
import { WRITABLE_PRODUCT_FIELDS, mapProductRowToDashboard, type StoreProductRow } from "@/lib/store/products";

/**
 * POST /api/store/products/:id/duplicate { slug }
 *
 * A copy of the product and its options, saved as a draft with "-copy" on its
 * web link and the stock codes cleared, ready to edit.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const { service, access, capabilities } = resolved;
  if (!capabilities.canManageProducts) return NextResponse.json({ error: "You can't add products." }, { status: 403 });

  const store = service.schema("store");
  const { data: original, error: readError } = await store
    .from("products")
    .select("*, product_variants(*)")
    .eq("id", id)
    .eq("tenant_id", access.tenantId)
    .maybeSingle();
  if (readError) {
    console.error("Duplicate product: read failed", readError);
    return NextResponse.json({ error: "We couldn't copy that product just now. Please try again." }, { status: 500 });
  }
  if (!original) return productNotFound();

  const { data: slugRows } = await store.from("products").select("slug").eq("tenant_id", access.tenantId).not("slug", "is", null);
  const taken = new Set((slugRows || []).map((r) => r.slug as string));

  const insert = buildDuplicateProduct(original as Record<string, unknown>, WRITABLE_PRODUCT_FIELDS, access.tenantId, taken);
  const { data: copy, error } = await store.from("products").insert(insert).select("*").single();
  if (error || !copy) {
    console.error("Duplicate product: insert failed", error);
    return NextResponse.json({ error: "We couldn't copy that product just now. Please try again." }, { status: 500 });
  }

  const variants = buildDuplicateVariants((original as StoreProductRow).product_variants || [], copy.id);
  let variantRows: StoreProductRow["product_variants"] = [];
  if (variants.length) {
    const { data, error: variantError } = await store.from("product_variants").insert(variants).select("*");
    if (variantError) {
      console.error("Duplicate product: variants failed", variantError);
      // Don't leave half a copy behind.
      await store.from("products").delete().eq("id", copy.id).eq("tenant_id", access.tenantId);
      return NextResponse.json({ error: "We couldn't copy that product's options. Please try again." }, { status: 500 });
    }
    variantRows = data || [];
  }

  // Its prices in other currencies, and the collections it's in (at the end of each).
  // Extras: if either fails the copy is still useful, so it's logged rather than undone.
  const [{ data: prices }, { data: memberships }] = await Promise.all([
    store.from("product_prices").select("currency, price, compare_at_price").eq("product_id", id),
    store.from("collection_products").select("collection_id").eq("product_id", id),
  ]);
  if (prices?.length) {
    const { error: pricesError } = await store.from("product_prices").insert(prices.map((p) => ({ ...p, product_id: copy.id })));
    if (pricesError) console.error("Duplicate product: currency prices not copied", pricesError);
  }
  for (const m of memberships || []) {
    const { data: last } = await store.from("collection_products").select("position").eq("collection_id", m.collection_id).order("position", { ascending: false }).limit(1).maybeSingle();
    const { error: memberError } = await store
      .from("collection_products")
      .insert({ collection_id: m.collection_id, product_id: copy.id, position: (Number(last?.position) || 0) + 1 });
    if (memberError) console.error("Duplicate product: collection not copied", memberError);
  }

  return NextResponse.json({ product: mapProductRowToDashboard({ ...copy, product_variants: variantRows } as StoreProductRow) }, { status: 201 });
}
