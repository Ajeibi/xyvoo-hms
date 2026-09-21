import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;

  const { data, error } = await result.service
    .schema("store")
    .from("product_reviews")
    .select("*")
    .eq("product_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ reviews: data || [] });
}

/** Dashboard-side manual entry for now; a public storefront review form is a separate follow-up. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await resolveStoreRequest(body?.slug || "");
  if (result.error) return result.error;

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

  await recomputeRatingStats(result.service, id);
  return NextResponse.json({ review: data }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });

  const { error } = await result.service.schema("store").from("product_reviews").delete().eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await recomputeRatingStats(result.service, id);
  return NextResponse.json({ success: true });
}

async function recomputeRatingStats(service: ReturnType<typeof createServerSupabaseClient>, productId: string) {
  const { data: reviews } = await service.schema("store").from("product_reviews").select("rating").eq("product_id", productId);
  const ratings = (reviews || []).map((r) => r.rating as number);
  const count = ratings.length;
  const average = count ? ratings.reduce((sum, r) => sum + r, 0) / count : 0;

  await service
    .schema("store")
    .from("products")
    .update({ rating_average: Math.round(average * 100) / 100, rating_count: count })
    .eq("id", productId);
}
