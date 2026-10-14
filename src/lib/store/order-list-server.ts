import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRowToDashboard, type DashboardOrder, type StoreOrderRow } from "./orders";
import { orderRefSearch, ORDERS_PAGE_SIZE, phoneSearchDigits, type OrderListQuery } from "./order-list";

/*
 * The Orders list, filtered and paged in the database so a shop with
 * thousands of orders opens it quickly. The quick views follow the same rules
 * as availableOrderActions (see order-attention.ts).
 */

const PAY_LATER = `("Pay on Delivery","WhatsApp","Pay later")`;
const SELECT = "*, store_order_items:order_items(*)";

/** Postgres "column does not exist": the phase 1 migration hasn't been applied yet. */
const missingColumn = (error: { code?: string; message?: string } | null) => error?.code === "42703" || /column .* does not exist/i.test(error?.message ?? "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST's builder types don't survive being passed around
function applyFilters(builder: any, tenantId: string, query: OrderListQuery, opts: { useRef: boolean }) {
  let b = builder.eq("tenant_id", tenantId);
  if (query.status) b = b.eq("status", query.status);
  if (query.from) b = b.gte("created_at", query.from);
  if (query.to) b = b.lt("created_at", query.to);

  if (query.payment === "paid") b = b.eq("payment_status", "paid");
  else if (query.payment === "unpaid") b = b.eq("payment_status", "unpaid");
  else if (query.payment === "refunded") b = b.or("payment_status.eq.refunded,refunded_amount.gt.0");
  else if (query.payment === "failed") b = b.eq("payment_status", "failed");

  if (query.view === "to-send") {
    b = b.in("status", ["Pending", "Confirmed"]).neq("payment_status", "refunded").or(`payment_status.eq.paid,payment_method.in.${PAY_LATER}`);
  } else if (query.view === "to-confirm") {
    b = b
      .neq("status", "Cancelled")
      .not("payment_status", "in", "(paid,refunded)")
      .neq("payment_method", "Card")
      .or(`status.in.(Shipped,Delivered),payment_method.not.in.${PAY_LATER}`);
  } else if (query.view === "awaiting") {
    b = b.neq("status", "Cancelled").not("payment_status", "in", "(paid,refunded)").or("status.eq.Pending,payment_status.eq.failed");
  }

  if (query.q) {
    const like = `*${query.q}*`;
    const parts = [`customer_name.ilike.${like}`, `customer_email.ilike.${like}`, `customer_phone.ilike.${like}`];
    const ref = orderRefSearch(query.q);
    if (ref && opts.useRef) parts.push(`order_ref.like.${ref}*`);
    const digits = phoneSearchDigits(query.q);
    if (digits) parts.push(`customer_phone.ilike.*${digits}*`);
    b = b.or(parts.map((p) => (p.includes(" ") ? p.replace(/\.(i?like)\.(.*)$/, '.$1."$2"') : p)).join(","));
  }
  return b;
}

async function runList(tenantId: string, query: OrderListQuery, range: [number, number], count: boolean) {
  const db = createServerSupabaseClient().schema("store");
  const build = (useRef: boolean) =>
    applyFilters(db.from("orders").select(SELECT, count ? { count: "exact" } : undefined), tenantId, query, { useRef })
      .order("created_at", { ascending: false })
      .range(range[0], range[1]);
  let result = await build(true);
  // Before the migration: no order_ref or refunded_amount, so search by name, email and phone only.
  if (result.error && missingColumn(result.error)) result = await build(false);
  return result as { data: StoreOrderRow[] | null; error: { message: string } | null; count: number | null };
}

export async function listOrdersPage(tenantId: string, query: OrderListQuery, fallbackCurrency: string) {
  const start = (query.page - 1) * ORDERS_PAGE_SIZE;
  const { data, error, count } = await runList(tenantId, query, [start, start + ORDERS_PAGE_SIZE - 1], true);
  if (error) throw new Error(error.message);
  return {
    orders: (data || []).map((row) => mapOrderRowToDashboard(row, fallbackCurrency)),
    total: count ?? 0,
  };
}

/** Every order matching the filters, for the CSV download (up to `limit`). */
export async function listOrdersForExport(tenantId: string, query: OrderListQuery, fallbackCurrency: string, limit = 20_000) {
  const orders: DashboardOrder[] = [];
  const chunk = 1000;
  for (let start = 0; start < limit; start += chunk) {
    const { data, error } = await runList(tenantId, query, [start, Math.min(start + chunk, limit) - 1], false);
    if (error) throw new Error(error.message);
    orders.push(...(data || []).map((row) => mapOrderRowToDashboard(row, fallbackCurrency)));
    if ((data?.length ?? 0) < chunk) break;
  }
  return orders;
}

/** How many orders are ready to send and how many payments need checking (for the quick-view menu). */
export async function countAttention(tenantId: string) {
  const db = createServerSupabaseClient().schema("store");
  const count = async (view: OrderListQuery["view"]) => {
    const { count: n, error } = await applyFilters(
      db.from("orders").select("id", { count: "exact", head: true }),
      tenantId,
      { view, status: null, payment: "any", q: "", from: null, to: null, page: 1 },
      { useRef: false },
    );
    if (error) throw new Error(error.message);
    return n ?? 0;
  };
  const [toSend, toConfirm, awaiting] = await Promise.all([count("to-send"), count("to-confirm"), count("awaiting")]);
  return { toSend, toConfirm, awaiting };
}
