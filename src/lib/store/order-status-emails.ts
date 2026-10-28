import { badge, detailsPanel, escapeHtml } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { formatShopCurrency } from "@/lib/shop/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { claimOrderEmail, releaseOrderEmail } from "./order-events";
import { orderRef } from "./orders";
import { sendLinkedPush } from "./push-links";
import { storefrontUrl } from "./subdomain";
import { whatsappOrderUpdate } from "./whatsapp-messages";
import { translatorFor } from "./i18n/shopper";
import type { Translator } from "./i18n/translate";
import { layoutWords, shopperEmailT } from "./order-emails";

/*
 * Shopper emails when an order moves on: shipped, delivered, cancelled,
 * refunded. Exactly one per change: each is claimed on the order timeline
 * before it's sent. Never throws; call from after().
 */

export type OrderStatusEmail = "shipped" | "delivered" | "cancelled" | { refundId: string; amount: number };

async function loadContext(tenantId: string, orderId: string) {
  const db = createServerSupabaseClient();
  const [{ data: order }, { data: profile }, { data: tenant }] = await Promise.all([
    db.schema("store").from("orders").select("*, order_items(product_name, quantity, line_total)").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle(),
    db.schema("store").from("business_profile").select("business_email, currency_code").eq("tenant_id", tenantId).maybeSingle(),
    db.from("tenants").select("subdomain, name, display_name").eq("id", tenantId).maybeSingle(),
  ]);
  if (!order || !tenant) return null;
  const currency = (order.currency as string | null) || (profile?.currency_code as string | null) || "NGN";
  return {
    order,
    items: (order.order_items as { product_name: string; quantity: number; line_total: number }[]) || [],
    storeName: (tenant.display_name as string | null)?.trim() || String(tenant.subdomain || tenant.name),
    slug: String(tenant.subdomain || tenant.name),
    money: (v: number) => formatShopCurrency(v, currency),
    reference: orderRef(order.id as string),
    shopContact: (profile?.business_email as string | null) || null,
  };
}

type Content = { key: string; subject: string; badge: [string, "green" | "blue" | "red" | "amber"]; title: string; lines: string[]; rows: { label: string; value: string; href?: string }[] };

/** The update's words, in the shopper's language (`t`). */
function build(kind: OrderStatusEmail, ctx: NonNullable<Awaited<ReturnType<typeof loadContext>>>, t: Translator): Content {
  const { order, storeName, reference, money, items } = ctx;
  const shop = storeName;
  const ref = reference;
  const itemRows = items.map((i) => ({ label: `${i.quantity} ×`, value: i.product_name }));
  if (kind === "shipped") {
    const number = (order.tracking_number as string | null) || null;
    const carrier = (order.tracking_carrier as string | null) || null;
    return {
      key: "shipped",
      subject: t("emails.shippedSubject", { ref, shop }),
      badge: [t("emails.badgeOnItsWay"), "blue"],
      title: t("emails.shippedTitle"),
      lines: [
        t("emails.shippedLine", { shop }),
        number ? (carrier ? t("emails.trackingLineCarrier", { number, carrier }) : t("emails.trackingLine", { number })) : t("emails.shippedNoTracking", { shop }),
      ],
      rows: [
        { label: t("emails.labelOrder"), value: reference },
        ...itemRows,
        ...(order.delivery_method ? [{ label: t("emails.labelDelivery"), value: String(order.delivery_method) }] : []),
        ...(carrier ? [{ label: t("emails.labelCarrier"), value: carrier }] : []),
        ...(number ? [{ label: t("emails.labelTrackingNumber"), value: number }] : []),
      ],
    };
  }
  if (kind === "delivered") {
    return {
      key: "delivered",
      subject: t("emails.deliveredSubject", { ref, shop }),
      badge: [t("emails.badgeDelivered"), "green"],
      title: t("emails.deliveredTitle"),
      lines: [t("emails.deliveredLine", { shop }), t("emails.deliveredHelp")],
      rows: [{ label: t("emails.labelOrder"), value: reference }, ...itemRows],
    };
  }
  if (kind === "cancelled") {
    const paid = order.payment_status === "paid" || order.payment_status === "refunded";
    return {
      key: "cancelled",
      subject: t("emails.cancelledSubject", { ref, shop }),
      badge: [t("emails.badgeCancelled"), "red"],
      title: t("emails.cancelledTitle"),
      lines: [t("emails.cancelledLine", { shop, ref }), paid ? t("emails.cancelledPaid") : t("emails.cancelledUnpaid")],
      rows: [{ label: t("emails.labelOrder"), value: reference }, ...itemRows, { label: t("emails.labelOrderTotal"), value: money(Number(order.total_amount) || 0) }],
    };
  }
  const full = Number(order.refunded_amount) >= Number(order.total_amount);
  const card = order.payment_method === "Card";
  const amount = money(kind.amount);
  return {
    key: `refunded:${kind.refundId}`,
    subject: t("emails.refundSubject", { shop, amount, ref }),
    badge: [t("emails.badgeRefund"), "green"],
    title: full ? t("emails.refundTitleFull") : t("emails.refundTitlePart"),
    lines: [t("emails.refundLine", { shop, amount, ref }), card ? t("emails.refundCard") : t("emails.refundDirect", { shop })],
    rows: [
      { label: t("emails.labelOrder"), value: reference },
      { label: t("emails.labelRefunded"), value: amount },
      { label: t("emails.labelOrderTotal"), value: money(Number(order.total_amount) || 0) },
    ],
  };
}

/** Where the notification takes the shopper: their order's own page in the shop. */
const orderPagePath = (order: Record<string, unknown>) =>
  order.payment_method === "Card" ? `/checkout/callback?reference=${order.id}` : `/checkout/received?order=${order.id}`;

/** The same update as a notification, on devices the shopper asked to get it on. Once per change, like the email. */
async function orderStatusPush(tenantId: string, orderId: string, ctx: NonNullable<Awaited<ReturnType<typeof loadContext>>>, content: Content, timelineTitle: string) {
  const claim = await claimOrderEmail(tenantId, orderId, `push:${content.key}`, `Notification sent: ${timelineTitle.toLowerCase()}`);
  if (!claim) return;
  const reached = await sendLinkedPush(tenantId, "order", orderId, {
    title: `${content.title} (${ctx.reference})`,
    body: content.lines[0],
    path: orderPagePath(ctx.order),
    tag: `order-${orderId}`,
  });
  // Nobody to tell: leave no "sent" line on the order's timeline.
  if (!reached) await releaseOrderEmail(tenantId, claim);
}

export async function sendOrderStatusEmail(tenantId: string, orderId: string, kind: OrderStatusEmail) {
  // The same update on WhatsApp, for shoppers who asked for it (never throws; it has its own once-only claim).
  await whatsappOrderUpdate(tenantId, orderId, kind);
  try {
    const ctx = await loadContext(tenantId, orderId);
    if (!ctx) return;
    // The email and notification in the language the shopper ordered in; the order's timeline stays in English for the shop.
    const t = await shopperEmailT(tenantId, ctx.order.language);
    const content = build(kind, ctx, t);
    const timelineTitle = build(kind, ctx, translatorFor("en")).title;
    await orderStatusPush(tenantId, orderId, ctx, content, timelineTitle).catch((error) => console.error("[order status push] not sent", { orderId, error }));
    const to = ctx.order.customer_email as string | null | undefined;
    if (!to) return;
    const claim = await claimOrderEmail(tenantId, orderId, content.key, `Email sent to ${to}: ${timelineTitle.toLowerCase()}`);
    if (!claim) return;
    try {
      await sendBrandedEmail({
        to,
        subject: content.subject,
        replyTo: ctx.shopContact,
        text: [t("emails.hello", { name: String(ctx.order.customer_name) }), "", ...content.lines, "", ...content.rows.map((r) => `${r.label}: ${r.value}`)].join("\n"),
        layout: {
          ...layoutWords(t),
          preheader: content.lines[0].slice(0, 110),
          badges: [badge(...content.badge)],
          title: content.title,
          intro: t("emails.statusIntro", { name: String(ctx.order.customer_name), line: content.lines[0] }),
          body: `${detailsPanel(content.rows)}
          <p style="margin:20px 0 0;color:#1e293b;font-size:15px;line-height:1.6">${escapeHtml(content.lines.slice(1).join(" "))}</p>`,
          buttons: [{ label: t("emails.visitShop", { shop: ctx.storeName }), href: storefrontUrl(ctx.slug) }],
          footerNote: t("emails.footerOrder", { shop: ctx.storeName }),
        },
      });
    } catch (error) {
      await releaseOrderEmail(tenantId, claim);
      throw error;
    }
  } catch (error) {
    console.error("[order status email] not sent", { orderId, error });
  }
}

/** The shopper email that follows an order action, if any. */
export function emailForAction(action: string): OrderStatusEmail | null {
  if (action === "shipped") return "shipped";
  if (action === "delivered") return "delivered";
  if (action === "cancel") return "cancelled";
  return null;
}
