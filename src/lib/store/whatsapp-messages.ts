import { formatShopCurrency } from "@/lib/shop/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStorePlan, storeHasFeature } from "./features";
import { getAlertPrefs, getAlertWhatsAppNumber } from "./merchant-alerts";
import { offlineNextStep, parseOfflinePayments } from "./offline-payments";
import type { OrderStatusEmail } from "./order-status-emails";
import { whatsappNumber } from "./whatsapp";
import { sendTemplateMessage, whatsappDailyCap, whatsappMode, WhatsAppSendError } from "./whatsapp-sender";
import { renderTemplate, templateParam, WHATSAPP_TEMPLATES, type WhatsAppAudience, type WhatsAppTemplateKey } from "./whatsapp-templates";

/*
 * WhatsApp order messages, sent from XYVOO's number on each shop's behalf:
 * to the shop's alert number (new orders, paid-after-cancelled) and to
 * shoppers who ticked "Send my order updates on WhatsApp" at checkout.
 *
 * Every message is first claimed as a row in store.whatsapp_messages (one per
 * order, audience and kind), so it goes once however often the code runs; the
 * row then records what happened. Nothing here throws: a message must never
 * get in the way of an order.
 *
 * Called next to the matching emails: order-emails.ts (new orders and the
 * paid-after-cancelled alert) and order-status-emails.ts (sent, delivered,
 * cancelled, refunded), plus the "Payment received" order action.
 */

const store = () => createServerSupabaseClient().schema("store");

export type WhatsAppOrderUpdate = OrderStatusEmail | "payment_received";

type Outgoing = {
  tenantId: string;
  orderId: string;
  audience: WhatsAppAudience;
  kind: string;
  to: string;
  template: WhatsAppTemplateKey;
  params: string[];
  /** The end of the button's link: "<slug>/chat" or "<slug>/orders". */
  buttonSuffix: string;
};

/** True for a missing table or column: the WhatsApp migration hasn't been run yet. */
const notMigrated = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST205";

async function optedOut(phone: string) {
  const { data } = await store().from("whatsapp_opt_outs").select("phone").eq("phone", phone).maybeSingle();
  return Boolean(data);
}

async function sentToday(tenantId: string) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await store()
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", since.toISOString())
    .not("status", "eq", "skipped");
  return count ?? 0;
}

/** Claims, sends (or logs) and records one message. Never throws. */
export async function deliverWhatsApp(message: Outgoing) {
  try {
    const template = WHATSAPP_TEMPLATES[message.template];
    const params = message.params.map((p) => templateParam(p, 500));
    const row = {
      tenant_id: message.tenantId,
      order_id: message.orderId,
      audience: message.audience,
      kind: message.kind,
      to_phone: message.to,
      template: template.name,
      params,
      body: renderTemplate(template, params),
    };

    // Reasons not to send are recorded too, so the shop's log explains a missing message.
    const skip =
      message.audience === "customer" && (await optedOut(message.to))
        ? "The customer replied STOP to WhatsApp messages."
        : (await sentToday(message.tenantId)) >= whatsappDailyCap()
          ? "The shop reached today's WhatsApp message limit."
          : null;

    const { data: claimed, error } = await store()
      .from("whatsapp_messages")
      .upsert({ ...row, status: skip ? "skipped" : "pending", error: skip }, { onConflict: "order_id,audience,kind", ignoreDuplicates: true })
      .select("id");
    if (error) {
      if (!notMigrated(error)) console.error("[whatsapp] claim failed", { kind: message.kind, error: error.message });
      return;
    }
    const id = claimed?.[0]?.id as string | undefined;
    if (!id || skip) return;

    if (whatsappMode() === "log") {
      await store().from("whatsapp_messages").update({ status: "logged", updated_at: new Date().toISOString() }).eq("id", id);
      return;
    }
    try {
      const providerId = await sendTemplateMessage({ to: message.to, template, params, buttonSuffix: message.buttonSuffix });
      await store().from("whatsapp_messages").update({ status: "sent", provider_message_id: providerId, updated_at: new Date().toISOString() }).eq("id", id);
    } catch (sendError) {
      const text = sendError instanceof WhatsAppSendError ? `${sendError.message}${sendError.code ? ` (${sendError.code})` : ""}` : "Couldn't reach WhatsApp.";
      await store().from("whatsapp_messages").update({ status: "failed", error: text.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", id);
      console.error("[whatsapp] not sent", { kind: message.kind, error: text });
    }
  } catch (error) {
    console.error("[whatsapp] message failed", { kind: message.kind, error });
  }
}

type OrderRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount: number | string | null;
  refunded_amount?: number | string | null;
  payment_method: string | null;
  payment_status: string | null;
  tracking_number?: string | null;
  tracking_carrier?: string | null;
  currency?: string | null;
  whatsapp_updates?: boolean | null;
  order_items: Array<{ quantity: number }> | null;
};

/** The order and shop a message needs, or null when the shop's plan doesn't include WhatsApp messages. */
async function loadContext(tenantId: string, orderId: string) {
  if (!storeHasFeature(await getStorePlan(tenantId), "whatsappMessages")) return null;
  const db = createServerSupabaseClient();
  const [{ data: order }, { data: profile }, { data: tenant }] = await Promise.all([
    db.schema("store").from("orders").select("*, order_items(quantity)").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle(),
    db.schema("store").from("business_profile").select("currency_code, country_code, offline_payments").eq("tenant_id", tenantId).maybeSingle(),
    db.from("tenants").select("subdomain, name, display_name").eq("id", tenantId).maybeSingle(),
  ]);
  if (!order || !tenant) return null;
  const row = order as OrderRow;
  const slug = String(tenant.subdomain || tenant.name);
  const currency = row.currency || (profile?.currency_code as string | null) || "NGN";
  const countryCode = (profile?.country_code as string | null) || "NG";
  return {
    order: row,
    slug,
    storeName: (tenant.display_name as string | null)?.trim() || slug,
    money: (v: number | string | null | undefined) => formatShopCurrency(Number(v) || 0, currency),
    reference: row.id.slice(0, 8).toUpperCase(),
    firstName: (row.customer_name || "there").trim().split(/\s+/)[0],
    offline: parseOfflinePayments(profile?.offline_payments),
    // Only shoppers who ticked the box at checkout, with a number WhatsApp can use.
    customerPhone: row.whatsapp_updates ? whatsappNumber(row.customer_phone, countryCode) : null,
  };
}

type Context = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

const toCustomer = (ctx: Context, tenantId: string, kind: string, template: WhatsAppTemplateKey, params: string[]) =>
  ctx.customerPhone
    ? deliverWhatsApp({ tenantId, orderId: ctx.order.id, audience: "customer", kind, to: ctx.customerPhone, template, params, buttonSuffix: `${ctx.slug}/chat` })
    : Promise.resolve();

async function toShop(ctx: Context, tenantId: string, kind: "new_order" | "paid_cancelled", template: WhatsAppTemplateKey, params: string[]) {
  const [prefs, number] = await Promise.all([getAlertPrefs(tenantId), getAlertWhatsAppNumber(tenantId)]);
  if (!number || !prefs[kind].whatsapp) return;
  await deliverWhatsApp({ tenantId, orderId: ctx.order.id, audience: "shop", kind, to: number, template, params, buttonSuffix: `${ctx.slug}/orders` });
}

/** A new order (paid by card, or placed to pay offline): the shopper's confirmation and the shop's alert. Never throws. */
export async function whatsappNewOrder(tenantId: string, orderId: string) {
  try {
    const ctx = await loadContext(tenantId, orderId);
    if (!ctx) return;
    const { order, storeName, money, reference, firstName } = ctx;
    const total = money(order.total_amount);
    const paid = order.payment_status === "paid";

    await (paid
      ? toCustomer(ctx, tenantId, "order_paid", "order_paid", [firstName, storeName, total, reference])
      : toCustomer(ctx, tenantId, "order_received", "order_received", [
          firstName,
          storeName,
          reference,
          total,
          offlineNextStep({ paymentMethod: order.payment_method, offline: ctx.offline, storeName, total, reference }),
        ]));

    const items = (order.order_items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0);
    const method = order.payment_method || "Card";
    await toShop(ctx, tenantId, "new_order", "shop_new_order", [
      storeName,
      total,
      order.customer_name || "a customer",
      `${items} ${items === 1 ? "item" : "items"}`,
      paid ? `paid by ${method.toLowerCase()}` : `${method}, confirm it when the money arrives`,
    ]);
  } catch (error) {
    console.error("[whatsapp] new order messages failed", { orderId, error });
  }
}

/** A payment arrived for an order that had already been cancelled. Never throws. */
export async function whatsappPaidCancelled(tenantId: string, orderId: string) {
  try {
    const ctx = await loadContext(tenantId, orderId);
    if (!ctx) return;
    await toShop(ctx, tenantId, "paid_cancelled", "shop_paid_cancelled", [ctx.storeName, ctx.order.customer_name || "A customer", ctx.money(ctx.order.total_amount), ctx.reference]);
  } catch (error) {
    console.error("[whatsapp] paid-cancelled alert failed", { orderId, error });
  }
}

/** The shopper's message when their order moves on. Never throws. */
export async function whatsappOrderUpdate(tenantId: string, orderId: string, update: WhatsAppOrderUpdate) {
  try {
    const ctx = await loadContext(tenantId, orderId);
    if (!ctx?.customerPhone) return;
    const { order, storeName, money, reference, firstName } = ctx;

    if (update === "payment_received") {
      return await toCustomer(ctx, tenantId, "payment_received", "payment_received", [firstName, storeName, money(order.total_amount), reference]);
    }
    if (update === "shipped") {
      const tracking = order.tracking_number
        ? `Tracking number: ${order.tracking_number}${order.tracking_carrier ? ` (${order.tracking_carrier})` : ""}.`
        : `${storeName} will be in touch if anything changes.`;
      return await toCustomer(ctx, tenantId, "shipped", "shipped", [firstName, reference, storeName, tracking]);
    }
    if (update === "delivered") return await toCustomer(ctx, tenantId, "delivered", "delivered", [firstName, storeName, reference]);
    if (update === "cancelled") {
      const paid = order.payment_status === "paid" || order.payment_status === "refunded";
      const note = paid ? "If you've paid and haven't had a refund yet, the shop will sort it out." : "You haven't been charged for it.";
      return await toCustomer(ctx, tenantId, "cancelled", "cancelled", [firstName, storeName, reference, note]);
    }
    const note =
      order.payment_method === "Card"
        ? "It goes back to the card or account you paid with. Banks usually take a few working days to show it."
        : `${storeName} has returned this money to you directly.`;
    await toCustomer(ctx, tenantId, `refunded:${update.refundId}`, "refunded", [firstName, storeName, money(update.amount), reference, note]);
  } catch (error) {
    console.error("[whatsapp] order update failed", { orderId, error });
  }
}

export type WhatsAppLogEntry = {
  id: string;
  audience: WhatsAppAudience;
  kind: string;
  toPhone: string;
  body: string;
  status: string;
  error: string | null;
  createdAt: string;
  orderId: string | null;
};

/** The shop's recent WhatsApp messages, newest first, for its message log. Empty before the migration runs. */
export async function listWhatsAppMessages(tenantId: string, limit = 30): Promise<WhatsAppLogEntry[]> {
  const { data, error } = await store()
    .from("whatsapp_messages")
    .select("id, audience, kind, to_phone, body, status, error, created_at, order_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []).map((m) => ({
    id: m.id as string,
    audience: m.audience as WhatsAppAudience,
    kind: m.kind as string,
    toPhone: m.to_phone as string,
    body: m.body as string,
    status: m.status as string,
    error: (m.error as string | null) ?? null,
    createdAt: m.created_at as string,
    orderId: (m.order_id as string | null) ?? null,
  }));
}
