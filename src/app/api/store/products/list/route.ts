import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext } from "@/lib/store/access";
import { mapProductRowToDashboard, type StoreProductRow } from "@/lib/store/products";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const access = await getStoreAccessContext(slug);
  if (!access.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.tenantId || !access.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServerSupabaseClient();
  const { data, error } = await service
    .schema("store")
    .from("products")
    .select("*, product_variants(*)")
    .eq("tenant_id", access.tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const products = ((data || []) as StoreProductRow[]).map(mapProductRowToDashboard);
  return NextResponse.json({ products });
}
