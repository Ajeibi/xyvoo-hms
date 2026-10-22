import { allRows } from "@/lib/supabase/all-rows";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * A light CRM: one record per customer, built from the store's orders (by
 * email, or phone when there's no email), with automatic groups and the
 * shop's own tags and notes.
 */

export const SEGMENTS = ["vip", "repeat", "new", "one_time", "at_risk", "lapsed", "not_paid"] as const;
export type CustomerSegment = (typeof SEGMENTS)[number];

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  vip: "VIP",
  repeat: "Repeat",
  new: "New",
  one_time: "One-time",
  at_risk: "At risk",
  lapsed: "Lapsed",
  not_paid: "Never paid",
};

export const SEGMENT_HELP: Record<CustomerSegment, string> = {
  vip: "3 or more paid orders, or among your top spenders",
  repeat: "2 paid orders",
  new: "First paid order in the last 30 days",
  one_time: "One paid order, more than 30 days ago",
  at_risk: "Bought more than once, but not in the last 2 months",
  lapsed: "No paid order for 4 months or more",
  not_paid: "Placed orders that haven't been paid or confirmed",
};

export type CustomerRow = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  orders: number;
  paidOrders: number;
  totalSpent: number;
  averageOrder: number;
  firstOrderAt: string;
  lastOrderAt: string;
  lastPaidAt: string | null;
  segment: CustomerSegment;
  tags: string[];
  note: string;
};

const DAY = 86_400_000;

/** The one group a customer is shown in. `vipThreshold` is the spend of the store's top 10%. */
export function customerSegment(c: { paidOrders: number; totalSpent: number; lastPaidAt: string | null }, vipThreshold: number, now = Date.now()): CustomerSegment {
  if (c.paidOrders === 0 || !c.lastPaidAt) return "not_paid";
  const daysSince = (now - new Date(c.lastPaidAt).getTime()) / DAY;
  if (daysSince >= 120) return "lapsed";
  if (c.paidOrders >= 2 && daysSince >= 60) return "at_risk";
  if (c.paidOrders >= 3 || (c.paidOrders >= 2 && vipThreshold > 0 && c.totalSpent >= vipThreshold)) return "vip";
  if (c.paidOrders === 2) return "repeat";
  return daysSince <= 30 ? "new" : "one_time";
}

/** Spend needed to be in the top 10% of paying customers. */
export function vipThreshold(spends: number[]) {
  const paying = spends.filter((s) => s > 0).sort((a, b) => b - a);
  if (paying.length < 10) return 0;
  return paying[Math.max(0, Math.ceil(paying.length * 0.1) - 1)];
}

const db = () => createServerSupabaseClient().schema("store");

export async function listCustomers(tenantId: string, now = Date.now()): Promise<CustomerRow[]> {
  // Paged: a shop can have more customers than one request returns.
  const [{ data, error }, { data: notes }] = await Promise.all([
    allRows<Record<string, unknown>>((from, to) => db().rpc("customer_summaries", { p_tenant: tenantId }).order("customer_key").range(from, to)),
    allRows<{ customer_key: string; tags: string[] | null; note: string | null }>((from, to) =>
      db().from("customer_notes").select("customer_key, tags, note").eq("tenant_id", tenantId).order("customer_key").range(from, to),
    ),
  ]);
  if (error) throw new Error(error.message);
  const rows = data;
  const notesByKey = new Map((notes || []).map((n) => [n.customer_key as string, n]));
  const threshold = vipThreshold(rows.map((r) => Number(r.total_spent) || 0));

  return rows
    .map((r) => {
      const paidOrders = Number(r.paid_orders) || 0;
      const totalSpent = Number(r.total_spent) || 0;
      const lastPaidAt = (r.last_paid_at as string | null) ?? null;
      const note = notesByKey.get(String(r.customer_key));
      return {
        key: String(r.customer_key),
        name: String(r.name || "Customer"),
        email: (r.email as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
        orders: Number(r.orders) || 0,
        paidOrders,
        totalSpent,
        averageOrder: paidOrders ? Math.round((totalSpent / paidOrders) * 100) / 100 : 0,
        firstOrderAt: String(r.first_order_at),
        lastOrderAt: String(r.last_order_at),
        lastPaidAt,
        segment: customerSegment({ paidOrders, totalSpent, lastPaidAt }, threshold, now),
        tags: (note?.tags as string[]) || [],
        note: (note?.note as string) || "",
      };
    })
    .sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}

export const customerKeySchema = z.string().trim().min(3).max(220);

export async function getCustomerOrders(tenantId: string, key: string) {
  let query = db()
    .from("orders")
    .select("id, created_at, status, payment_status, total_amount, delivery_method, order_items(product_name, quantity, line_total)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (key.startsWith("name:")) {
    // Orders with no email or phone, grouped by the name typed on them.
    const name = key.slice(5);
    if (!name) return [];
    query = query.is("customer_email", null).ilike("customer_name", name.replace(/[%_\\]/g, (c) => `\\${c}`));
  } else if (key.startsWith("phone:")) {
    const digits = key.slice(6).replace(/[^0-9]/g, "");
    if (!digits) return [];
    // Phone numbers are stored as typed, so compare digits only.
    const { data: candidates } = await db().from("orders").select("id, customer_phone").eq("tenant_id", tenantId).is("customer_email", null);
    const ids = (candidates || []).filter((c) => (c.customer_phone || "").replace(/[^0-9]/g, "") === digits).map((c) => c.id);
    if (!ids.length) return [];
    query = query.in("id", ids);
  } else {
    query = query.ilike("customer_email", key.replace(/[%_\\]/g, (c) => `\\${c}`));
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((o) => ({
    id: o.id as string,
    createdAt: o.created_at as string,
    status: o.status as string,
    paymentStatus: o.payment_status as string,
    total: Number(o.total_amount) || 0,
    deliveryMethod: (o.delivery_method as string | null) ?? null,
    items: ((o.order_items as { product_name: string; quantity: number; line_total: number }[]) || []).map((i) => ({ name: i.product_name, quantity: i.quantity, total: Number(i.line_total) || 0 })),
  }));
}

export const customerNoteSchema = z.object({
  key: customerKeySchema,
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  note: z.string().max(2000).default(""),
});

export async function saveCustomerNote(tenantId: string, input: z.infer<typeof customerNoteSchema>) {
  const tags = [...new Set(input.tags.map((t) => t.toLowerCase()))];
  const { error } = await db()
    .from("customer_notes")
    .upsert({ tenant_id: tenantId, customer_key: input.key, tags, note: input.note.trim(), updated_at: new Date().toISOString() }, { onConflict: "tenant_id,customer_key" });
  if (error) throw new Error(error.message);
}

/** CSV for spreadsheets. Cells that could run as formulas in Excel are prefixed so they stay plain text. */
export function customersToCsv(customers: CustomerRow[]) {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Name", "Email", "Phone", "Group", "Paid orders", "All orders", "Total spent", "Average order", "First order", "Last order", "Tags", "Note"];
  const lines = customers.map((c) =>
    [c.name, c.email, c.phone, SEGMENT_LABELS[c.segment], c.paidOrders, c.orders, c.totalSpent.toFixed(2), c.averageOrder.toFixed(2), c.firstOrderAt.slice(0, 10), c.lastOrderAt.slice(0, 10), c.tags.join("; "), c.note]
      .map(cell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}
