import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext } from "@/lib/store/access";
import { mapOrderRowToDashboard, type StoreOrderRow } from "@/lib/store/orders";

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
    .from("orders")
    .select("*, store_order_items:order_items(*)")
    .eq("tenant_id", access.tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const orders = ((data || []) as StoreOrderRow[]).map(mapOrderRowToDashboard);
  return NextResponse.json({ orders });
}
