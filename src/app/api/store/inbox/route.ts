import { after, NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { runCartRemindersIfDue } from "@/lib/store/cart-reminders";
import { runStockAlertsIfDue } from "@/lib/store/stock-alerts";
import { runGiftCardEmailsIfDue } from "@/lib/store/gift-cards";
import { runCampaignsIfDue } from "@/lib/store/campaigns-server";
import { runLoyaltyExpiryIfDue } from "@/lib/store/loyalty-server";
import { formatShopCurrency } from "@/lib/shop/format";
import type { InboxItem } from "@/lib/store/inbox";
import { reviewerName } from "@/lib/store/reviews";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/store/inbox?slug= — the bell's list: new orders and reviews from the last two weeks,
 * and products that have sold out or are running low. Newest first, at most 15.
 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  const resolved = await resolveStoreRequest(slug);
  if (resolved.error) return resolved.error;
  const tenantId = resolved.access.tenantId;
  // Shop owners using the dashboard also keep basket reminders on time (at most every ten minutes).
  after(runCartRemindersIfDue);
  after(runStockAlertsIfDue);
  after(runGiftCardEmailsIfDue);
  after(runCampaignsIfDue);
  after(runLoyaltyExpiryIfDue);
  const db = resolved.service.schema("store");
  const since = new Date(Date.now() - 14 * DAY_MS).toISOString();
  const base = `/storefront/${encodeURIComponent(slug)}`;

  const [orders, reviews, stock] = await Promise.all([
    db
      .from("orders")
      .select("id, customer_name, total_amount, currency, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("product_reviews")
      .select("id, customer_name, rating, status, created_at, products(name)")
      .eq("tenant_id", tenantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5),
    db.from("products").select("id, name, stock, reorder_level").eq("tenant_id", tenantId).eq("status", "active").limit(500),
  ]);

  const items: InboxItem[] = [];
  for (const o of orders.data || []) {
    items.push({
      id: `order-${o.id}`,
      kind: "order",
      title: `New order from ${reviewerName(String(o.customer_name || ""))}`,
      detail: formatShopCurrency(Number(o.total_amount) || 0, String(o.currency || "NGN")),
      at: String(o.created_at),
      href: `${base}/orders/${o.id}`,
    });
  }
  // Reviews need the reviews migration; without it there are simply none to show.
  for (const r of reviews.error ? [] : reviews.data || []) {
    const product = (Array.isArray(r.products) ? r.products[0] : r.products) as { name: string } | null;
    items.push({
      id: `review-${r.id}`,
      kind: "review",
      title: `${reviewerName(String(r.customer_name || ""))} left ${r.rating} ${Number(r.rating) === 1 ? "star" : "stars"}`,
      detail: `${product?.name ?? "A product"}${r.status === "pending" ? " · waiting for you to approve" : ""}`,
      at: String(r.created_at),
      href: `${base}/reviews`,
    });
  }
  const now = new Date().toISOString();
  const soldOut = (stock.data || []).filter((p) => Number(p.stock) <= 0);
  const low = (stock.data || []).filter((p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.reorder_level));
  if (soldOut.length) {
    items.push({
      id: "stock-out",
      kind: "stock",
      title: soldOut.length === 1 ? `${soldOut[0].name} has sold out` : `${soldOut.length} products have sold out`,
      detail: "Restock so customers can buy again.",
      at: now,
      href: `${base}/products`,
    });
  }
  if (low.length) {
    items.push({
      id: "stock-low",
      kind: "stock",
      title: low.length === 1 ? `${low[0].name} is running low` : `${low.length} products are running low`,
      detail: "Time to order more.",
      at: now,
      href: `${base}/products`,
    });
  }
  // Stock news first (it's about now), then orders and reviews by time.
  items.sort((a, b) => (a.kind === "stock" ? -1 : b.kind === "stock" ? 1 : b.at.localeCompare(a.at)));
  return NextResponse.json({ items: items.slice(0, 15) }, { headers: { "Cache-Control": "no-store" } });
}
