import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;

  const { data, error } = await result.service
    .schema("store")
    .from("product_prices")
    .select("*")
    .eq("product_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ prices: data || [] });
}

/** Upsert (by product_id + currency) so setting a currency's price twice just updates it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await resolveStoreRequest(body?.slug || "");
  if (result.error) return result.error;
  if (!result.capabilities.canManagePricing) {
    return NextResponse.json({ error: "Only an owner or admin can manage pricing." }, { status: 403 });
  }

  if (!body?.currency || typeof body.price !== "number") {
    return NextResponse.json({ error: "currency and price are required." }, { status: 400 });
  }

  const { data, error } = await result.service
    .schema("store")
    .from("product_prices")
    .upsert(
      {
        product_id: id,
        currency: body.currency,
        price: body.price,
        compare_at_price: body.compare_at_price ?? null,
      },
      { onConflict: "product_id,currency" },
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ price: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!result.capabilities.canManagePricing) {
    return NextResponse.json({ error: "Only an owner or admin can manage pricing." }, { status: 403 });
  }
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });

  const { error } = await result.service.schema("store").from("product_prices").delete().eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
