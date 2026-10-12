import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listOrderEvents, type OrderEvent } from "./order-events";
import { mapOrderRowToDashboard, type DashboardOrder, type StoreOrderItemRow, type StoreOrderRow } from "./orders";
import { listOrderRefunds, type OrderRefund } from "./refunds-server";

export type OrderDetailItem = StoreOrderItemRow & { options: Record<string, string> };

export type OrderDetail = {
  order: DashboardOrder;
  items: OrderDetailItem[];
  paidAt: string | null;
  /** When the customer was asked for a review (after delivery), if they have been. */
  reviewRequestedAt: string | null;
  events: OrderEvent[];
  refunds: OrderRefund[];
};

/** Everything the order page shows, for one order of one shop. */
export async function loadOrderDetail(tenantId: string, orderId: string, shopCurrency: string): Promise<OrderDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const db = createServerSupabaseClient().schema("store");
  const load = (withOptions: boolean) =>
    db
      .from("orders")
      .select(withOptions ? "*, store_order_items:order_items(*, product_variants(options))" : "*, store_order_items:order_items(*)")
      .eq("tenant_id", tenantId)
      .eq("id", orderId)
      .maybeSingle();
  let result = await load(true);
  if (result.error) result = await load(false);
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;

  const row = result.data as unknown as StoreOrderRow & { paid_at?: string | null; review_requested_at?: string | null };
  const items = ((row.store_order_items || []) as (StoreOrderItemRow & { product_variants?: { options?: Record<string, unknown> } | null })[]).map((item) => {
    const raw = item.product_variants?.options ?? {};
    const options = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k, String(v)]));
    return { ...item, product_variants: undefined, options };
  });
  const [events, refunds] = await Promise.all([listOrderEvents(tenantId, orderId), listOrderRefunds(tenantId, orderId)]);
  return { order: mapOrderRowToDashboard(row, shopCurrency), items, paidAt: row.paid_at ?? null, reviewRequestedAt: row.review_requested_at ?? null, events, refunds };
}
