import { badge, detailsPanel, escapeHtml } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { formatShopCurrency } from "@/lib/shop/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { claimOrderEmail, releaseOrderEmail } from "./order-events";
import { orderRef } from "./orders";
import { storefrontUrl } from "./subdomain";
import { whatsappOrderUpdate } from "./whatsapp-messages";

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

function build(kind: OrderStatusEmail, ctx: NonNullable<Awaited<ReturnType<typeof loadContext>>>): Content {
  const { order, storeName, reference, money, items } = ctx;
  const itemRows = items.map((i) => ({ label: `${i.quantity} ×`, value: i.product_name }));
  if (kind === "shipped") {
    const number = (order.tracking_number as string | null) || null;
    const carrier = (order.tracking_carrier as string | null) || null;
    return {
      key: "shipped",
      subject: `Your order ${reference} from ${storeName} is on its way`,
      badge: ["On its way", "blue"],
      title: "Your order is on its way",
      lines: [
        `${storeName} has sent your order.`,
        number ? `Tracking number: ${number}${carrier ? ` (${carrier})` : ""}.` : `${storeName} will be in touch if anything changes.`,
      ],
      rows: [
        { label: "Order", value: reference },
        ...itemRows,
        ...(order.delivery_method ? [{ label: "Delivery", value: String(order.delivery_method) }] : []),
        ...(carrier ? [{ label: "Carrier", value: carrier }] : []),
        ...(number ? [{ label: "Tracking number", value: number }] : []),
      ],
    };
  }
  if (kind === "delivered") {
    return {
      key: "delivered",
      subject: `Your order ${reference} from ${storeName} has been delivered`,
      badge: ["Delivered", "green"],
      title: "Your order has been delivered",
      lines: [`${storeName} has marked your order as delivered. We hope you enjoy it.`, "If anything isn't right, reply to this email to contact the shop."],
      rows: [{ label: "Order", value: reference }, ...itemRows],
    };
  }
  if (kind === "cancelled") {
    const paid = order.payment_status === "paid" || order.payment_status === "refunded";
    return {
      key: "cancelled",
      subject: `Your order ${reference} from ${storeName} has been cancelled`,
      badge: ["Cancelled", "red"],
      title: "Your order has been cancelled",
      lines: [
        `${storeName} has cancelled your order ${reference}.`,
        paid ? "If you've paid and haven't had a refund yet, reply to this email and the shop will sort it out." : "You haven't been charged for it.",
      ],
      rows: [{ label: "Order", value: reference }, ...itemRows, { label: "Order total", value: money(Number(order.total_amount) || 0) }],
    };
  }
  const full = Number(order.refunded_amount) >= Number(order.total_amount);
  const card = order.payment_method === "Card";
  return {
    key: `refunded:${kind.refundId}`,
    subject: `${storeName} has refunded ${money(kind.amount)} for order ${reference}`,
    badge: ["Refund", "green"],
    title: full ? "Your order has been refunded" : "Part of your order has been refunded",
    lines: [
      `${storeName} has refunded ${money(kind.amount)} for your order ${reference}.`,
      card ? "It goes back to the card or account you paid with. Banks usually take a few working days to show it." : `${storeName} has returned this money to you directly.`,
    ],
    rows: [
      { label: "Order", value: reference },
      { label: "Refunded", value: money(kind.amount) },
      { label: "Order total", value: money(Number(order.total_amount) || 0) },
    ],
  };
}

export async function sendOrderStatusEmail(tenantId: string, orderId: string, kind: OrderStatusEmail) {
  // The same update on WhatsApp, for shoppers who asked for it (never throws; it has its own once-only claim).
  await whatsappOrderUpdate(tenantId, orderId, kind);
  try {
    const ctx = await loadContext(tenantId, orderId);
    const to = ctx?.order.customer_email as string | null | undefined;
    if (!ctx || !to) return;
    const content = build(kind, ctx);
    const claim = await claimOrderEmail(tenantId, orderId, content.key, `Email sent to ${to}: ${content.title.toLowerCase()}`);
    if (!claim) return;
    try {
      await sendBrandedEmail({
        to,
        subject: content.subject,
        replyTo: ctx.shopContact,
        text: [`Hello ${ctx.order.customer_name},`, "", ...content.lines, "", ...content.rows.map((r) => `${r.label}: ${r.value}`)].join("\n"),
        layout: {
          preheader: content.lines[0].slice(0, 110),
          badges: [badge(...content.badge)],
          title: content.title,
          intro: `Hello ${ctx.order.customer_name}. ${content.lines[0]}`,
          body: `${detailsPanel(content.rows)}
          <p style="margin:20px 0 0;color:#1e293b;font-size:15px;line-height:1.6">${escapeHtml(content.lines.slice(1).join(" "))}</p>`,
          buttons: [{ label: `Visit ${ctx.storeName}`, href: storefrontUrl(ctx.slug) }],
          footerNote: `You're receiving this because you placed an order with ${ctx.storeName}. Reply to this email to contact the shop.`,
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
