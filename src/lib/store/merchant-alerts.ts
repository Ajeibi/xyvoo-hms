import webpush, { WebPushError } from "web-push";
import { badge, detailsPanel, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { formatShopCurrency } from "@/lib/shop/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { productsAtLowStock, parseAlertPrefs, parseAlertWhatsAppNumber, type AlertKind, type AlertPrefs } from "./merchant-alert-prefs";
import { getPushConfig, type PushSubscriptionInput } from "./push";

/*
 * Alerts to the shop itself, by email and on the phones and computers where
 * someone on the team chose "Get alerts on this device". Every function here
 * never throws: an alert must never get in the way of an order.
 *
 * Called from:
 *   - order-emails.ts: alertNewOrder() at the start of sendOrderReceivedEmails
 *     (offline orders) and sendOrderPaidEmails (card and fully-discounted
 *     orders), which already run once per order; alertPaidCancelled() from
 *     sendPaidCancelledAlert. The existing shop emails there check
 *     shopAlertEmailWanted() so the preferences apply to them too.
 *   - the Paystack webhook (charge.failed): alertCardPaymentFailedByReference().
 *   - checkout verify (failed or abandoned card payment): alertCardPaymentFailed().
 */

const store = () => createServerSupabaseClient().schema("store");

export async function getAlertPrefs(tenantId: string): Promise<AlertPrefs> {
  try {
    const { data } = await store().from("alert_settings").select("preferences").eq("tenant_id", tenantId).maybeSingle();
    return parseAlertPrefs(data?.preferences);
  } catch {
    return parseAlertPrefs(null);
  }
}

/** The number the shop's WhatsApp alerts go to, if it has added one. */
export async function getAlertWhatsAppNumber(tenantId: string): Promise<string | null> {
  try {
    const { data } = await store().from("alert_settings").select("preferences").eq("tenant_id", tenantId).maybeSingle();
    return parseAlertWhatsAppNumber(data?.preferences);
  } catch {
    return null;
  }
}

/** Saves the alert choices. The WhatsApp number is kept as it is unless one is given (null removes it). */
export async function saveAlertPrefs(tenantId: string, prefs: AlertPrefs, whatsappNumber?: string | null) {
  const number = whatsappNumber === undefined ? await getAlertWhatsAppNumber(tenantId) : whatsappNumber;
  const { error } = await store()
    .from("alert_settings")
    .upsert({ tenant_id: tenantId, preferences: { ...prefs, ...(number ? { whatsapp_number: number } : {}) } }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

/** For the existing shop emails in order-emails.ts: whether the shop wants this alert by email. */
export async function shopAlertEmailWanted(tenantId: string, kind: AlertKind) {
  return (await getAlertPrefs(tenantId))[kind].email;
}

/** Claims an alert so it goes once. True for the first caller only. */
async function claimAlert(tenantId: string, kind: string, targetId: string) {
  const { data, error } = await store()
    .from("merchant_alerts_sent")
    .upsert({ tenant_id: tenantId, kind, target_id: targetId }, { onConflict: "kind,target_id", ignoreDuplicates: true })
    .select("target_id");
  if (error) {
    console.error("[merchant alerts] claim failed", { kind, error: error.message });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

type ShopInfo = { slug: string; storeName: string; currency: string; email: string | null };

async function shopInfo(tenantId: string): Promise<ShopInfo | null> {
  const db = createServerSupabaseClient();
  const [{ data: tenant }, { data: profile }] = await Promise.all([
    db.from("tenants").select("subdomain, name, display_name").eq("id", tenantId).eq("product", "store").maybeSingle(),
    db.schema("store").from("business_profile").select("business_email, currency_code").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (!tenant) return null;
  const slug = String(tenant.subdomain || tenant.name || "");
  return {
    slug,
    storeName: (tenant.display_name as string | null)?.trim() || slug,
    currency: (profile?.currency_code as string | null) || "NGN",
    email: (profile?.business_email as string | null) || null,
  };
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export async function saveMerchantDevice(tenantId: string, userId: string, sub: PushSubscriptionInput, userAgent: string | null) {
  const { error } = await store()
    .from("merchant_push_subscriptions")
    .upsert(
      { tenant_id: tenantId, user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent?.slice(0, 300) ?? null, last_seen_at: new Date().toISOString() },
      { onConflict: "tenant_id,endpoint" },
    );
  if (error) throw new Error(error.message);
}

export async function removeMerchantDevice(tenantId: string, userId: string, endpoint: string) {
  const { error } = await store().from("merchant_push_subscriptions").delete().eq("tenant_id", tenantId).eq("user_id", userId).eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}

export async function countMerchantDevices(tenantId: string, userId?: string) {
  let query = store().from("merchant_push_subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (userId) query = query.eq("user_id", userId);
  const { count } = await query;
  return count ?? 0;
}

export type MerchantPush = { title: string; body: string; path: string; tag: string };

/**
 * Sends to the team's devices. Only people who are still members get it (a
 * removed person's devices are deleted with their membership, and checked
 * again here). Returns how many devices it reached.
 */
export async function sendMerchantPush(tenantId: string, message: MerchantPush, onlyUserId?: string): Promise<number> {
  const config = getPushConfig();
  if (!config) return 0;
  try {
    const db = store();
    let subsQuery = db.from("merchant_push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("tenant_id", tenantId);
    if (onlyUserId) subsQuery = subsQuery.eq("user_id", onlyUserId);
    const [{ data: subs }, { data: members }] = await Promise.all([subsQuery, db.from("memberships").select("user_id").eq("tenant_id", tenantId)]);
    const memberIds = new Set((members || []).map((m) => m.user_id as string));
    const targets = (subs || []).filter((s) => memberIds.has(s.user_id as string));
    if (!targets.length) return 0;

    const payload = JSON.stringify({ title: message.title.slice(0, 80), body: message.body.slice(0, 200), url: message.path, tag: message.tag });
    // High urgency and a short life: an order alert that arrives tomorrow is no use.
    const options = { vapidDetails: config, TTL: 60 * 60, urgency: "high" as const };
    const gone: string[] = [];
    let delivered = 0;
    await Promise.all(
      targets.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options);
          delivered += 1;
        } catch (e) {
          if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.id as string);
        }
      }),
    );
    if (gone.length) await db.from("merchant_push_subscriptions").delete().eq("tenant_id", tenantId).in("id", gone);
    return delivered;
  } catch (error) {
    console.error("[merchant alerts] push failed", { tenantId, error });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

const ordersPath = (slug: string) => `/storefront/${slug}/orders`;

type OrderSummary = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  total_amount: number | string | null;
  payment_method: string | null;
  payment_status: string | null;
  order_items: Array<{ product_id: string | null; quantity: number }> | null;
};

async function loadOrder(tenantId: string, orderId: string): Promise<OrderSummary | null> {
  const { data } = await store()
    .from("orders")
    .select("id, customer_name, customer_email, customer_phone, total_amount, payment_method, payment_status, order_items(product_id, quantity)")
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  return (data as OrderSummary | null) ?? null;
}

const reference = (orderId: string) => orderId.slice(0, 8).toUpperCase();

/**
 * A new order: a push to the team's devices (the emails are sent by
 * order-emails.ts), then a low-stock check for the products in it. Once per order.
 */
export async function alertNewOrder(tenantId: string, orderId: string) {
  try {
    if (!(await claimAlert(tenantId, "new_order", orderId))) return;
    const [order, shop, prefs] = await Promise.all([loadOrder(tenantId, orderId), shopInfo(tenantId), getAlertPrefs(tenantId)]);
    if (!order || !shop) return;

    if (prefs.new_order.push) {
      const items = (order.order_items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0);
      const total = formatShopCurrency(Number(order.total_amount) || 0, shop.currency);
      const paid = order.payment_status === "paid";
      await sendMerchantPush(tenantId, {
        title: `New order: ${total}`,
        body: `${order.customer_name || "A customer"} · ${items} ${items === 1 ? "item" : "items"} · ${paid ? "Paid" : `${order.payment_method || "Payment"}: confirm when the money arrives`}`,
        path: ordersPath(shop.slug),
        tag: `order-${order.id}`,
      });
    }

    await checkLowStock(tenantId, (order.order_items || []).map((i) => i.product_id).filter((id): id is string => Boolean(id)), shop, prefs);
  } catch (error) {
    console.error("[merchant alerts] new order alert failed", { orderId, error });
  }
}

/** Products now at or below their low-stock level, alerted once until stock goes back above it. */
export async function checkLowStock(tenantId: string, productIds: string[], shopArg?: ShopInfo | null, prefsArg?: AlertPrefs) {
  try {
    const ids = [...new Set(productIds)];
    if (!ids.length) return;
    const { data } = await store().from("products").select("id, name, stock, reorder_level").eq("tenant_id", tenantId).in("id", ids);
    type StockItem = { id: string; name: string; stock: number; reorder_level: number };
    const products = (data || []) as StockItem[];
    const low = productsAtLowStock(products) as StockItem[];

    // Sizes and colours too: each against its product's low-stock level, with its own alert ("variant:<id>").
    const { data: variantRows } = await store()
      .from("product_variants")
      .select("id, product_id, options, stock")
      .in("product_id", products.map((p) => p.id))
      .is("archived_at", null);
    const byId = new Map(products.map((p) => [p.id, p]));
    const variants: StockItem[] = (variantRows || []).flatMap((v) => {
      const product = byId.get(v.product_id as string);
      if (!product || product.reorder_level == null) return [];
      const label = Object.values((v.options as Record<string, string>) || {}).join(" / ");
      return [{ id: `variant:${v.id}`, name: label ? `${product.name} (${label})` : product.name, stock: Number(v.stock) || 0, reorder_level: product.reorder_level }];
    });
    const lowVariants = productsAtLowStock(variants) as StockItem[];
    // A size that's been restocked above the level can warn again next time it runs low.
    const restocked = variants.filter((v) => !lowVariants.includes(v)).map((v) => v.id);
    if (restocked.length) await store().from("merchant_alerts_sent").delete().eq("tenant_id", tenantId).eq("kind", "low_stock").in("target_id", restocked);

    if (!low.length && !lowVariants.length) return;
    const fresh: StockItem[] = [];
    for (const p of [...low, ...lowVariants]) if (await claimAlert(tenantId, "low_stock", p.id)) fresh.push(p);
    if (!fresh.length) return;

    const [shop, prefs] = await Promise.all([shopArg ?? shopInfo(tenantId), prefsArg ?? getAlertPrefs(tenantId)]);
    if (!shop) return;
    const lines = fresh.map((p) => `${p.name}: ${p.stock <= 0 ? "sold out" : `${p.stock} left`}`);
    const productsPath = `/storefront/${shop.slug}/products`;

    if (prefs.low_stock.push) {
      await sendMerchantPush(tenantId, {
        title: fresh.length === 1 ? `Running low: ${fresh[0].name}` : `${fresh.length} products running low`,
        body: lines.join(" · "),
        path: productsPath,
        tag: `low-stock-${fresh.map((p) => p.id).join("-").slice(0, 60)}`,
      });
    }
    const to = prefs.low_stock.email ? await shopEmail(tenantId, shop) : null;
    if (to) {
      await sendBrandedEmail({
        to,
        subject: fresh.length === 1 ? `Running low: ${fresh[0].name}` : `${fresh.length} products are running low`,
        text: [`These products have reached their low-stock level in ${shop.storeName}:`, ...lines, "", `Update stock in Products: ${EMAIL_SITE_URL}${productsPath}`].join("\n"),
        layout: {
          preheader: lines.join(", ").slice(0, 120),
          badges: [badge("Running low", "amber")],
          title: fresh.length === 1 ? `${fresh[0].name} is running low` : "Some products are running low",
          intro: "An order has just taken these products down to the low-stock level you set. Restock them, or update the numbers, so customers can keep buying.",
          body: detailsPanel(fresh.map((p) => ({ label: p.name, value: p.stock <= 0 ? "Sold out" : `${p.stock} left (low-stock level ${p.reorder_level})` }))),
          buttons: [{ label: "Open products", href: `${EMAIL_SITE_URL}${productsPath}` }],
          footerNote: `You're receiving this because low-stock alerts are on for ${shop.storeName}. Change them in Order alerts.`,
        },
      });
    }
  } catch (error) {
    console.error("[merchant alerts] low stock check failed", { tenantId, error });
  }
}

/** The shop's contact email, or the owner's sign-in email if the shop hasn't set one. */
async function shopEmail(tenantId: string, shop: ShopInfo) {
  if (shop.email) return shop.email;
  const db = createServerSupabaseClient();
  const { data: owner } = await db.schema("store").from("memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "owner").limit(1).maybeSingle();
  if (!owner) return null;
  const { data } = await db.auth.admin.getUserById(owner.user_id as string);
  return data.user?.email ?? null;
}

/** A card payment failed. Once per order; only if the shop has someone to follow up with. */
export async function alertCardPaymentFailed(tenantId: string, orderId: string) {
  try {
    if (!(await claimAlert(tenantId, "payment_failed", orderId))) return;
    const [order, shop, prefs] = await Promise.all([loadOrder(tenantId, orderId), shopInfo(tenantId), getAlertPrefs(tenantId)]);
    if (!order || !shop) return;
    const total = formatShopCurrency(Number(order.total_amount) || 0, shop.currency);
    const who = order.customer_name || "A customer";
    const path = ordersPath(shop.slug);

    if (prefs.payment_failed.push) {
      await sendMerchantPush(tenantId, {
        title: `Card payment didn't go through: ${total}`,
        body: `${who}'s payment for order ${reference(order.id)} failed. They may need a hand.`,
        path,
        tag: `payment-failed-${order.id}`,
      });
    }
    const to = prefs.payment_failed.email ? await shopEmail(tenantId, shop) : null;
    if (to) {
      await sendBrandedEmail({
        to,
        subject: `A card payment didn't go through: order ${reference(order.id)}`,
        text: [
          `${who} tried to pay ${total} by card for order ${reference(order.id)}, but the payment didn't go through. Nothing was charged.`,
          "",
          "You may want to contact them: they might like to try again or pay another way.",
          ...(order.customer_phone ? [`Phone: ${order.customer_phone}`] : []),
          ...(order.customer_email ? [`Email: ${order.customer_email}`] : []),
        ].join("\n"),
        layout: {
          preheader: `${who}'s card payment of ${total} didn't go through.`,
          badges: [badge("Payment didn't go through", "amber")],
          title: "A card payment didn't go through",
          intro: `${who} tried to pay ${total} by card, but the payment didn't go through, so nothing was charged. They might like to try again or pay another way.`,
          body: detailsPanel([
            { label: "Order", value: reference(order.id) },
            { label: "Customer", value: who },
            ...(order.customer_phone ? [{ label: "Phone", value: order.customer_phone, href: `tel:${order.customer_phone.replace(/[^0-9+]/g, "")}` }] : []),
            ...(order.customer_email ? [{ label: "Email", value: order.customer_email, href: `mailto:${order.customer_email}` }] : []),
            { label: "Amount", value: total },
          ]),
          buttons: [{ label: "Open orders", href: `${EMAIL_SITE_URL}${path}` }],
          footerNote: `You're receiving this because payment alerts are on for ${shop.storeName}. Change them in Order alerts.`,
        },
      });
    }
  } catch (error) {
    console.error("[merchant alerts] failed-payment alert failed", { orderId, error });
  }
}

/** From the webhook, which only knows the payment reference. */
export async function alertCardPaymentFailedByReference(paystackReference: string) {
  try {
    const { data: intent } = await store().from("payment_intents").select("order_id, tenant_id").eq("paystack_reference", paystackReference).maybeSingle();
    if (!intent) return;
    // Only if the order hasn't been paid since (a second attempt can succeed).
    const { data: order } = await store().from("orders").select("payment_status").eq("id", intent.order_id).eq("tenant_id", intent.tenant_id).maybeSingle();
    if (!order || order.payment_status === "paid") return;
    await alertCardPaymentFailed(intent.tenant_id as string, intent.order_id as string);
  } catch (error) {
    console.error("[merchant alerts] failed-payment lookup failed", { error });
  }
}

/** A paid order that had been cancelled: push only, the email is sendPaidCancelledAlert's. Called once per order. */
export async function alertPaidCancelled(tenantId: string, orderId: string) {
  try {
    const [order, shop, prefs] = await Promise.all([loadOrder(tenantId, orderId), shopInfo(tenantId), getAlertPrefs(tenantId)]);
    if (!order || !shop || !prefs.paid_cancelled.push) return;
    const total = formatShopCurrency(Number(order.total_amount) || 0, shop.currency);
    await sendMerchantPush(tenantId, {
      title: "Action needed: a cancelled order was paid",
      body: `${order.customer_name || "A customer"} paid ${total} for cancelled order ${reference(order.id)}. Fulfil it or refund them.`,
      path: ordersPath(shop.slug),
      tag: `paid-cancelled-${order.id}`,
    });
  } catch (error) {
    console.error("[merchant alerts] paid-cancelled push failed", { orderId, error });
  }
}
