import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { SHOP_CURRENCIES } from "@/lib/store/currencies";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

type Service = ReturnType<typeof createServerSupabaseClient>;

/** The product must belong to the store making the request. */
async function ownsProduct(service: Service, tenantId: string, productId: string) {
  const { data } = await service.schema("store").from("products").select("id").eq("id", productId).eq("tenant_id", tenantId).maybeSingle();
  return Boolean(data);
}

const NOT_FOUND = () => NextResponse.json({ error: "Product not found." }, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!(await ownsProduct(result.service, result.access.tenantId, id))) return NOT_FOUND();

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

  const validAmount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100_000_000;
  if (!SHOP_CURRENCIES.includes(body?.currency) || !validAmount(body?.price)) {
    return NextResponse.json({ error: "currency and price are required." }, { status: 400 });
  }
  if (body.compare_at_price != null && !validAmount(body.compare_at_price)) {
    return NextResponse.json({ error: "Enter a valid compare-at price." }, { status: 400 });
  }
  if (!(await ownsProduct(result.service, result.access.tenantId, id))) return NOT_FOUND();

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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!result.capabilities.canManagePricing) {
    return NextResponse.json({ error: "Only an owner or admin can manage pricing." }, { status: 403 });
  }
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });
  if (!(await ownsProduct(result.service, result.access.tenantId, id))) return NOT_FOUND();

  const { error } = await result.service.schema("store").from("product_prices").delete().eq("id", itemId).eq("product_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
