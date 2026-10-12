import { NextResponse } from "next/server";
import { productNotFound, resolveStoreRequest, storeOwnsProducts } from "@/lib/store/api-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { data, error } = await result.service
    .schema("store")
    .from("product_cross_sells")
    .select("id, related_product_id, relation_type, related:related_product_id(id, name, sku, image_url, price)")
    .eq("product_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await resolveStoreRequest(body?.slug || "");
  if (result.error) return result.error;

  if (!body?.related_product_id) {
    return NextResponse.json({ error: "related_product_id is required." }, { status: 400 });
  }
  // Both products must be this store's: a link can't point at another store's catalogue.
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id, body.related_product_id]))) return productNotFound();

  const { data, error } = await result.service
    .schema("store")
    .from("product_cross_sells")
    .insert({
      product_id: id,
      related_product_id: body.related_product_id,
      relation_type: body.relation_type || "related",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { error } = await result.service.schema("store").from("product_cross_sells").delete().eq("id", itemId).eq("product_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
