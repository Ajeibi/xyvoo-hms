import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSale } from "./sales";

/*
 * Checkouts in progress, for abandoned-cart follow-up. The checkout page saves
 * the basket and contact details as the shopper types them (the page says so),
 * and the shop follows up by hand. Kept for 28 days.
 */

/** Minutes without activity before a checkout counts as abandoned. */
export const ABANDONED_AFTER_MINUTES = 30;

const token = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const checkoutSessionSchema = z.object({
  token,
  sessionId: token.optional(),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).regex(/^[0-9+()\s-]*$/).optional(),
  items: z
    .array(z.object({ productId: z.string().uuid(), variantId: z.string().uuid().nullable().optional(), quantity: z.number().int().min(1).max(1000) }))
    .min(1)
    .max(50),
});
export type CheckoutSessionInput = z.infer<typeof checkoutSessionSchema>;

const db = () => createServerSupabaseClient().schema("store");

/** Saves (or updates) a checkout. Prices and names come from the database, never the browser. Returns false when there's no way to contact the shopper yet. */
export async function saveCheckoutSession(tenantId: string, input: CheckoutSessionInput) {
  const email = input.email?.toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (!email && !phone) return false;

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const { data: products, error } = await db().from("products").select("id, name, price, currency").eq("tenant_id", tenantId).in("id", productIds);
  if (error) throw new Error(error.message);
  const byId = new Map((products || []).map((p) => [p.id as string, p]));

  const items = input.items
    .filter((i) => byId.has(i.productId))
    .map((i) => {
      const p = byId.get(i.productId)!;
      return { productId: i.productId, variantId: i.variantId ?? null, name: String(p.name), quantity: i.quantity, unitPrice: Number(p.price) || 0 };
    });
  if (!items.length) return false;

  const subtotal = Math.round(items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) * 100) / 100;
  const { error: upsertError } = await db()
    .from("checkouts")
    .upsert(
      {
        tenant_id: tenantId,
        token: input.token,
        session_id: input.sessionId ?? null,
        customer_name: input.name || null,
        customer_email: email,
        customer_phone: phone,
        items,
        subtotal,
        currency: String(byId.get(items[0].productId)?.currency || "NGN"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,token" },
    );
  if (upsertError) throw new Error(upsertError.message);
  return true;
}

/** Called when the shopper submits checkout: the checkout now has an order. */
export async function linkCheckoutToOrder(tenantId: string, checkoutToken: string, orderId: string) {
  if (!token.safeParse(checkoutToken).success) return;
  await db().from("checkouts").update({ order_id: orderId, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("token", checkoutToken);
}

export type FollowUp = "none" | "contacted" | "recovered" | "dismissed";

export type AbandonedCheckout = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  currency: string;
  /** Where they stopped: before submitting their details, or at payment. */
  stage: "details" | "payment";
  followUp: FollowUp;
  followedUpAt: string | null;
  /** They came back and paid later (any order with the same email or phone). */
  recoveredOrderId: string | null;
  lastActivityAt: string;
};

export async function listAbandonedCheckouts(tenantId: string, now = Date.now()): Promise<AbandonedCheckout[]> {
  const before = new Date(now - ABANDONED_AFTER_MINUTES * 60_000).toISOString();
  const { data, error } = await db()
    .from("checkouts")
    .select("id, customer_name, customer_email, customer_phone, items, subtotal, currency, order_id, follow_up, followed_up_at, created_at, updated_at, orders(payment_status, status)")
    .eq("tenant_id", tenantId)
    .lt("updated_at", before)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const rows = (data || []).filter((r) => {
    const order = r.orders as unknown as { payment_status: string; status: string } | null;
    return !order || !isSale(order.payment_status, order.status);
  });

  // Did they buy afterwards? Look for a later sale with the same email or phone.
  const emails = [...new Set(rows.map((r) => r.customer_email).filter(Boolean))] as string[];
  const phones = [...new Set(rows.map((r) => r.customer_phone).filter(Boolean))] as string[];
  const paidLater: { id: string; customer_email: string | null; customer_phone: string | null; created_at: string }[] = [];
  if (emails.length || phones.length) {
    const filters = [emails.length ? `customer_email.in.(${emails.map((e) => `"${e.replace(/"/g, "")}"`).join(",")})` : "", phones.length ? `customer_phone.in.(${phones.map((p) => `"${p.replace(/"/g, "")}"`).join(",")})` : ""].filter(Boolean).join(",");
    const { data: paid } = await db().from("orders").select("id, customer_email, customer_phone, created_at, payment_status, status").eq("tenant_id", tenantId).or(filters);
    paidLater.push(...(paid || []).filter((o) => isSale(o.payment_status, o.status)));
  }

  return rows.map((r) => {
    const recovered = paidLater.find(
      (o) => o.created_at > r.created_at && ((r.customer_email && o.customer_email?.toLowerCase() === r.customer_email) || (r.customer_phone && o.customer_phone === r.customer_phone)),
    );
    return {
      id: r.id,
      name: r.customer_name,
      email: r.customer_email,
      phone: r.customer_phone,
      items: (r.items as AbandonedCheckout["items"]) || [],
      subtotal: Number(r.subtotal) || 0,
      currency: r.currency,
      stage: r.order_id ? "payment" : "details",
      followUp: (recovered && r.follow_up !== "dismissed" ? "recovered" : r.follow_up) as FollowUp,
      followedUpAt: r.followed_up_at,
      recoveredOrderId: recovered?.id ?? null,
      lastActivityAt: r.updated_at,
    };
  });
}

export async function setCheckoutFollowUp(tenantId: string, checkoutId: string, followUp: FollowUp) {
  const { error } = await db()
    .from("checkouts")
    .update({ follow_up: followUp, followed_up_at: followUp === "none" ? null : new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", checkoutId);
  if (error) throw new Error(error.message);
}

export { whatsappLink } from "./whatsapp";
