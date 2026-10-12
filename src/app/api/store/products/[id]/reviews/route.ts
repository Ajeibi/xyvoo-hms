import { NextResponse } from "next/server";
import { productNotFound, resolveStoreRequest, storeOwnsProducts } from "@/lib/store/api-helpers";
import { recomputeRatingStats } from "@/lib/store/reviews-server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { data, error } = await result.service
    .schema("store")
    .from("product_reviews")
    .select("*")
    .eq("product_id", id)
    .eq("tenant_id", result.access.tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ reviews: data || [] });
}

/** A review the shop adds by hand (e.g. one sent by message). Customers review through the link emailed after delivery. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await resolveStoreRequest(body?.slug || "");
  if (result.error) return result.error;
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  if (!body?.customer_name || typeof body.rating !== "number") {
    return NextResponse.json({ error: "customer_name and rating are required." }, { status: 400 });
  }
  if (body.rating < 1 || body.rating > 5) {
    return NextResponse.json({ error: "rating must be between 1 and 5." }, { status: 400 });
  }

  const { data, error } = await result.service
    .schema("store")
    .from("product_reviews")
    .insert({
      tenant_id: result.access.tenantId,
      product_id: id,
      customer_name: body.customer_name,
      customer_email: body.customer_email || null,
      rating: body.rating,
      title: body.title || null,
      comment: body.comment || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await recomputeRatingStats(result.service, result.access.tenantId, id);
  return NextResponse.json({ review: data }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { error } = await result.service
    .schema("store")
    .from("product_reviews")
    .delete()
    .eq("id", itemId)
    .eq("product_id", id)
    .eq("tenant_id", result.access.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await recomputeRatingStats(result.service, result.access.tenantId, id);
  return NextResponse.json({ success: true });
}
