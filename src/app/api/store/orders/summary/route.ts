import { allRows } from "@/lib/supabase/all-rows";
import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { mapOrderRowToDashboard, type StoreOrderRow } from "@/lib/store/orders";
import { storeCurrency } from "@/lib/store/payout-routes";
import { releaseExpiredOrders } from "@/lib/store/release-orders";

const SELECT = "*, store_order_items:order_items(*)";

/**
 * GET /api/store/orders/summary?slug= — what the Home page needs: orders from
 * the last 60 days (this month's and last month's figures), the latest few,
 * and every open order (for "ready to send" and "payments to check").
 */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { tenantId } = resolved.access;

  await releaseExpiredOrders(tenantId).catch(() => 0);

  const db = resolved.service.schema("store");
  const since = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000).toISOString();
  const [recent, latest, open, currency] = await Promise.all([
    // Paged: a busy shop can take more orders in two months than one request returns.
    allRows((from, to) => db.from("orders").select(SELECT).eq("tenant_id", tenantId).gte("created_at", since).order("created_at", { ascending: false }).order("id").range(from, to), 20_000),
    db.from("orders").select(SELECT).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(6),
    db
      .from("orders")
      .select(SELECT)
      .eq("tenant_id", tenantId)
      .or("status.in.(Pending,Confirmed),and(status.in.(Shipped,Delivered),payment_status.eq.unpaid,payment_method.neq.Card)")
      .order("created_at", { ascending: false })
      .limit(1000),
    storeCurrency(tenantId, resolved.service),
  ]);
  const error = recent.error || latest.error || open.error;
  if (error) {
    console.error("[orders summary] failed", error);
    return NextResponse.json({ error: "We couldn't load your orders." }, { status: 500 });
  }

  const byId = new Map<string, StoreOrderRow>();
  for (const row of [...(recent.data || []), ...(latest.data || []), ...(open.data || [])] as StoreOrderRow[]) byId.set(row.id, row);
  const orders = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((row) => mapOrderRowToDashboard(row, currency));
  return NextResponse.json({ orders, currency }, { headers: { "Cache-Control": "no-store" } });
}
