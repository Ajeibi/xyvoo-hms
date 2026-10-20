import { badge, detailsPanel, EMAIL_SITE_URL, escapeHtml } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { formatShopCurrency } from "@/lib/shop/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { offlineNextStep, parseOfflinePayments } from "./offline-payments";
import { invoiceUrlFor, receiptForEmail } from "./receipts";
import { alertNewOrder, alertPaidCancelled, shopAlertEmailWanted } from "./merchant-alerts";
import { storefrontUrl } from "./subdomain";
import { whatsappNewOrder, whatsappPaidCancelled } from "./whatsapp-messages";

/** Short order reference shown to customers and shops, e.g. "3F9A12BC". */
export const orderReference = (orderId: string) => orderId.slice(0, 8).toUpperCase();

/**
 * After an offline order (bank transfer, pay on delivery, WhatsApp): tells the
 * customer what happens next, and tells the shop there's an order to confirm.
 * Never throws; a failed email mustn't affect the order.
 */
export async function sendOrderReceivedEmails(tenantId: string, orderId: string) {
  // Push to the shop's devices first, so they hear within seconds, then WhatsApp (neither throws).
  await alertNewOrder(tenantId, orderId);
  await whatsappNewOrder(tenantId, orderId);
  try {
    const db = createServerSupabaseClient();
    const [{ data: order }, { data: profile }, { data: tenant }] = await Promise.all([
      db
        .schema("store")
        .from("orders")
        // "*" so the order's own currency is read where it's been recorded.
        .select("*, order_items(product_name, quantity, line_total)")
        .eq("tenant_id", tenantId)
        .eq("id", orderId)
        .maybeSingle(),
      db.schema("store").from("business_profile").select("business_email, whatsapp, phone, currency_code, offline_payments").eq("tenant_id", tenantId).maybeSingle(),
      db.from("tenants").select("subdomain, name, display_name").eq("id", tenantId).maybeSingle(),
    ]);
    if (!order || !tenant) return;

    const storeName = (tenant.display_name as string | null)?.trim() || String(tenant.subdomain || tenant.name);
    const slug = String(tenant.subdomain || tenant.name);
    const currency = (order.currency as string | null) || (profile?.currency_code as string | null) || "NGN";
    const money = (v: number) => formatShopCurrency(v, currency);
    const reference = orderReference(order.id);
    const items = (order.order_items as { product_name: string; quantity: number; line_total: number }[]) || [];
    const discount = discountRows(order, money);
    const itemLines = [...items.map((i) => `${i.quantity} × ${i.product_name} (${money(Number(i.line_total) || 0)})`), ...discount.map((d) => `${d.label}: ${d.value}`)];
    const total = money(Number(order.total_amount) || 0);
    const offline = parseOfflinePayments(profile?.offline_payments);
    const shopContact = (profile?.business_email as string | null) || null;

    // ---- Customer
    if (order.customer_email) {
      const nextStep = offlineNextStep({ paymentMethod: order.payment_method, offline, storeName, total, reference });
      // Bank transfer orders get an invoice with the shop's bank details (see receipts.ts).
      const invoiceUrl = order.payment_method === "Bank Transfer" ? await invoiceUrlFor(tenantId, orderId) : null;
      await sendBrandedEmail({
        to: order.customer_email,
        subject: `We've got your order (${reference}) from ${storeName}`,
        replyTo: shopContact,
        text: [`Hello ${order.customer_name}, thank you for your order from ${storeName}.`, "", `Order ${reference}`, ...itemLines, `Total: ${total}`, "", nextStep, ...(invoiceUrl ? ["", `View your invoice: ${invoiceUrl}`] : [])].join("\n"),
        layout: {
          preheader: `Order ${reference}: ${nextStep.slice(0, 90)}`,
          badges: [badge("Order received", "green")],
          title: `Thank you for your order`,
          intro: `Hello ${order.customer_name}, ${storeName} has received your order.`,
          body: `${detailsPanel([
            { label: "Order", value: reference },
            ...items.map((i) => ({ label: `${i.quantity} ×`, value: `${i.product_name} (${money(Number(i.line_total) || 0)})` })),
            ...discount,
            { label: "Total", value: total },
            ...(order.delivery_method ? [{ label: "Delivery", value: String(order.delivery_method) }] : []),
          ])}
          <p style="margin:20px 0 0;color:#1e293b;font-size:15px;line-height:1.6"><strong>What happens next</strong><br>${escapeHtml(nextStep)}</p>`,
          buttons: [...(invoiceUrl ? [{ label: "View your invoice", href: invoiceUrl }] : []), { label: `Visit ${storeName}`, href: storefrontUrl(slug), ...(invoiceUrl ? { variant: "secondary" as const } : {}) }],
          footerNote: `You're receiving this because you placed an order with ${storeName}. Reply to this email to contact the shop.`,
        },
      });
    }

    // ---- Shop owner
    if (shopContact && (await shopAlertEmailWanted(tenantId, "new_order"))) {
      const dashboard = `${EMAIL_SITE_URL}/storefront/${slug}/orders`;
      await sendBrandedEmail({
        to: shopContact,
        subject: `New order ${reference}: ${total} by ${order.payment_method}`,
        text: [`New order from ${order.customer_name} (${[order.customer_phone, order.customer_email].filter(Boolean).join(", ")}).`, ...itemLines, `Total: ${total}`, `Payment: ${order.payment_method}`, "", `Confirm the payment, or cancel the order, in your dashboard: ${dashboard}`].join("\n"),
        layout: {
          preheader: `${order.customer_name} ordered ${total}. Confirm the payment when it arrives.`,
          badges: [badge("New order", "blue")],
          title: `New order from ${order.customer_name}`,
          intro: `Payment: ${order.payment_method}. Select "Payment received" in Orders once the money arrives, so it counts as a sale.`,
          body: detailsPanel([
            { label: "Order", value: reference },
            { label: "Customer", value: String(order.customer_name) },
            ...(order.customer_phone ? [{ label: "Phone", value: String(order.customer_phone), href: `tel:${String(order.customer_phone).replace(/[^0-9+]/g, "")}` }] : []),
            ...(order.customer_email ? [{ label: "Email", value: String(order.customer_email), href: `mailto:${order.customer_email}` }] : []),
            ...items.map((i) => ({ label: `${i.quantity} ×`, value: i.product_name })),
            ...discount,
            { label: "Total", value: total },
          ]),
          buttons: [{ label: "Open orders", href: dashboard }],
          footerNote: `You're receiving this because ${storeName} takes orders on XYVOO.`,
        },
      });
    }
  } catch (error) {
    console.error("[order emails] not sent", { orderId, error });
  }
}

/** The discount line for an order's emails, if it had one. */
/** The discount and any gift card on an order, as lines above the total. */
function discountRows(order: { discount_code?: string | null; discount_amount?: number | string | null; gift_card_amount?: number | string | null }, money: (v: number) => string) {
  const amount = Number(order.discount_amount) || 0;
  const gift = Number(order.gift_card_amount) || 0;
  return [
    ...(amount > 0 ? [{ label: `Discount${order.discount_code ? ` (${order.discount_code})` : ""}`, value: `−${money(amount)}` }] : []),
    ...(gift > 0 ? [{ label: "Paid with gift card", value: `−${money(gift)}` }] : []),
  ];
}

type OrderEmailContext = {
  order: {
    id: string;
    discount_code?: string | null;
    discount_amount?: number | string | null;
    gift_card_amount?: number | string | null;
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
    total_amount: number;
    delivery_method: string | null;
  };
  items: { product_name: string; quantity: number; line_total: number }[];
  storeName: string;
  slug: string;
  money: (v: number) => string;
  reference: string;
  shopContact: string | null;
};

async function loadOrderEmailContext(tenantId: string, orderId: string): Promise<OrderEmailContext | null> {
  const db = createServerSupabaseClient();
  const [{ data: order }, { data: profile }, { data: tenant }] = await Promise.all([
    db
      .schema("store")
      .from("orders")
      .select("*, order_items(product_name, quantity, line_total)")
      .eq("tenant_id", tenantId)
      .eq("id", orderId)
      .maybeSingle(),
    db.schema("store").from("business_profile").select("business_email, currency_code").eq("tenant_id", tenantId).maybeSingle(),
    db.from("tenants").select("subdomain, name, display_name").eq("id", tenantId).maybeSingle(),
  ]);
  if (!order || !tenant) return null;
  const currency = (order.currency as string | null) || (profile?.currency_code as string | null) || "NGN";
  return {
    order: order as OrderEmailContext["order"],
    items: (order.order_items as OrderEmailContext["items"]) || [],
    storeName: (tenant.display_name as string | null)?.trim() || String(tenant.subdomain || tenant.name),
    slug: String(tenant.subdomain || tenant.name),
    money: (v: number) => formatShopCurrency(v, currency),
    reference: orderReference(order.id),
    shopContact: (profile?.business_email as string | null) || null,
  };
}

/**
 * After a card payment clears: the customer's confirmation and the shop's
 * new-order alert. Called once per order (see card-payments.ts). Never throws.
 */
export async function sendOrderPaidEmails(tenantId: string, orderId: string) {
  // Push to the shop's devices first, so they hear within seconds, then WhatsApp (neither throws).
  await alertNewOrder(tenantId, orderId);
  await whatsappNewOrder(tenantId, orderId);
  try {
    const ctx = await loadOrderEmailContext(tenantId, orderId);
    if (!ctx) return;
    const { order, items, storeName, slug, money, reference, shopContact } = ctx;
    const discount = discountRows(order, money);
    const itemLines = [...items.map((i) => `${i.quantity} × ${i.product_name} (${money(Number(i.line_total) || 0)})`), ...discount.map((d) => `${d.label}: ${d.value}`)];
    const total = money(Number(order.total_amount) || 0);
    const nextStep = `${storeName} is preparing your order and will let you know when it's on its way.`;

    if (order.customer_email) {
      // The numbered PDF receipt, attached and linked (see receipts.ts). The email still goes without it.
      const receipt = await receiptForEmail(tenantId, orderId).catch(() => null);
      await sendBrandedEmail({
        to: order.customer_email,
        subject: `Payment received: your order ${reference} from ${storeName}`,
        replyTo: shopContact,
        attachments: receipt?.attachments,
        text: [
          `Hello ${order.customer_name}, thank you. Your payment of ${total} to ${storeName} has gone through.`,
          "",
          `Order ${reference}${receipt?.number ? `, receipt ${receipt.number}` : ""}`,
          ...itemLines,
          `Total paid: ${total}`,
          "",
          nextStep,
          ...(receipt ? ["", "Your receipt is attached to this email.", ...(receipt.url ? [`View your receipt: ${receipt.url}`] : [])] : []),
        ].join("\n"),
        layout: {
          preheader: `Order ${reference}: payment of ${total} received.`,
          badges: [badge("Paid", "green")],
          title: "Thank you, your order is confirmed",
          intro: `Hello ${order.customer_name}, your payment to ${storeName} has gone through.${receipt ? " Your receipt is attached to this email." : ""}`,
          body: `${detailsPanel([
            { label: "Order", value: reference },
            ...(receipt?.number ? [{ label: "Receipt", value: receipt.number }] : []),
            ...items.map((i) => ({ label: `${i.quantity} ×`, value: `${i.product_name} (${money(Number(i.line_total) || 0)})` })),
            ...discount,
            { label: "Total paid", value: total },
            ...(order.delivery_method ? [{ label: "Delivery", value: String(order.delivery_method) }] : []),
          ])}
          <p style="margin:20px 0 0;color:#1e293b;font-size:15px;line-height:1.6"><strong>What happens next</strong><br>${escapeHtml(nextStep)}</p>`,
          buttons: [...(receipt?.url ? [{ label: "View your receipt", href: receipt.url }] : []), { label: `Visit ${storeName}`, href: storefrontUrl(slug), ...(receipt?.url ? { variant: "secondary" as const } : {}) }],
          footerNote: `You're receiving this because you placed an order with ${storeName}. Reply to this email to contact the shop.`,
        },
      });
    }

    if (shopContact && (await shopAlertEmailWanted(tenantId, "new_order"))) {
      const dashboard = `${EMAIL_SITE_URL}/storefront/${slug}/orders`;
      await sendBrandedEmail({
        to: shopContact,
        subject: `New paid order ${reference}: ${total}`,
        text: [`${order.customer_name} paid ${total} by card.`, ...itemLines, "", `Open the order to ship it: ${dashboard}`].join("\n"),
        layout: {
          preheader: `${order.customer_name} paid ${total}. Time to pack it.`,
          badges: [badge("Paid order", "green")],
          title: `New order from ${order.customer_name}`,
          intro: "Paid by card. Pack it, then mark it as shipped in Orders so the customer knows.",
          body: detailsPanel([
            { label: "Order", value: reference },
            { label: "Customer", value: String(order.customer_name) },
            ...(order.customer_phone ? [{ label: "Phone", value: String(order.customer_phone), href: `tel:${String(order.customer_phone).replace(/[^0-9+]/g, "")}` }] : []),
            ...(order.customer_email ? [{ label: "Email", value: String(order.customer_email), href: `mailto:${order.customer_email}` }] : []),
            ...items.map((i) => ({ label: `${i.quantity} ×`, value: i.product_name })),
            ...discount,
            { label: "Total paid", value: total },
            ...(order.delivery_method ? [{ label: "Delivery", value: String(order.delivery_method) }] : []),
          ]),
          buttons: [{ label: "Open orders", href: dashboard }],
          footerNote: `You're receiving this because ${storeName} takes orders on XYVOO.`,
        },
      });
    }
  } catch (error) {
    console.error("[order emails] paid emails not sent", { orderId, error });
  }
}

/** A payment cleared on an order that had already been cancelled: the shop must fulfil it or return the money. */
export async function sendPaidCancelledAlert(tenantId: string, orderId: string) {
  await alertPaidCancelled(tenantId, orderId);
  await whatsappPaidCancelled(tenantId, orderId);
  try {
    const ctx = await loadOrderEmailContext(tenantId, orderId);
    if (!ctx?.shopContact || !(await shopAlertEmailWanted(tenantId, "paid_cancelled"))) return;
    const { order, slug, money, reference, shopContact } = ctx;
    const total = money(Number(order.total_amount) || 0);
    const dashboard = `${EMAIL_SITE_URL}/storefront/${slug}/orders`;
    await sendBrandedEmail({
      to: shopContact,
      subject: `Action needed: order ${reference} was paid after it was cancelled`,
      text: [
        `${order.customer_name} paid ${total} for order ${reference}, but the order had already been cancelled, so its items went back on sale.`,
        "",
        "Fulfil it if you still have the items, or refund the customer from your Paystack dashboard.",
        dashboard,
      ].join("\n"),
      layout: {
        preheader: `${order.customer_name} paid ${total} for a cancelled order.`,
        badges: [badge("Action needed", "red")],
        title: "A cancelled order has been paid",
        intro: `${order.customer_name} paid ${total} for order ${reference} after it was cancelled. Fulfil it if you still have the items, or refund the customer.`,
        body: detailsPanel([
          { label: "Order", value: reference },
          { label: "Customer", value: String(order.customer_name) },
          ...(order.customer_email ? [{ label: "Email", value: String(order.customer_email), href: `mailto:${order.customer_email}` }] : []),
          { label: "Amount paid", value: total },
        ]),
        buttons: [{ label: "Open orders", href: dashboard }],
        footerNote: "You're receiving this because a payment needs your attention.",
      },
    });
  } catch (error) {
    console.error("[order emails] paid-cancelled alert not sent", { orderId, error });
  }
}
