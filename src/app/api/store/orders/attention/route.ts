import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext } from "@/lib/store/access";
import { countOrdersNeedingAttention } from "@/lib/store/order-attention";

/** GET /api/store/orders/attention?slug= — how many orders are waiting on the shop (the Orders badge). */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const access = await getStoreAccessContext(slug);
  if (!access.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.tenantId || !access.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only open orders can need anything, so this stays small however many orders a shop has.
  const { data, error } = await createServerSupabaseClient()
    .schema("store")
    .from("orders")
    .select("status, payment_status, payment_method")
    .eq("tenant_id", access.tenantId)
    .in("status", ["Pending", "Confirmed"])
    .limit(1000);
  if (error) return NextResponse.json({ error: "We couldn't check your orders." }, { status: 500 });

  const counts = countOrdersNeedingAttention(
    (data || []).map((o) => ({ status: o.status, paymentStatus: o.payment_status ?? "unpaid", paymentMethod: o.payment_method })),
  );
  // Reviews waiting for the shop's approval (none before the reviews migration).
  const { count: reviews } = await createServerSupabaseClient()
    .schema("store")
    .from("product_reviews")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", access.tenantId)
    .eq("status", "pending");
  return NextResponse.json({ ...counts, reviews: reviews ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
