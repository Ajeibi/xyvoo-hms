/*
 * The WhatsApp message templates XYVOO sends from its own WhatsApp Business
 * number. Meta only lets a business start a conversation with a template it
 * has approved, so each one here must be created, word for word, in WhatsApp
 * Manager (category "Utility", language "English"), with the same name.
 * docs/WHATSAPP_SETUP.md lists them ready to paste.
 *
 * Meta's rules these follow: variables are numbered {{1}}, {{2}}… in order and
 * used once each, a body never starts or ends with a variable, and a variable
 * holds one line of text (no line breaks or tabs).
 */

export type WhatsAppAudience = "shop" | "customer";

export type WhatsAppTemplate = {
  name: string;
  audience: WhatsAppAudience;
  /** What the message is for, for the setup doc. */
  purpose: string;
  body: string;
  /** Example values Meta asks for when the template is submitted. */
  examples: string[];
  footer: string;
  /** A link button. The URL is `${siteUrl}${path}{{1}}`; the order's message fills in {{1}}. */
  button: { text: string; path: string; example: string };
};

const CUSTOMER_FOOTER = "Reply STOP to stop order updates";
const SHOP_FOOTER = "Sent by XYVOO. Change alerts in your dashboard";
/** Opens the shop's own WhatsApp chat (or its contact page): /api/shop/<slug>/chat. */
const chatButton = { text: "Chat with the shop", path: "/api/shop/", example: "adashop/chat" };
/** The shop's orders in the dashboard: /storefront/<slug>/orders. */
const ordersButton = { text: "Open orders", path: "/storefront/", example: "adashop/orders" };

export const WHATSAPP_TEMPLATES = {
  order_paid: {
    name: "xyvoo_order_paid",
    audience: "customer",
    purpose: "To the shopper when a card payment goes through.",
    body: "Hi {{1}}, thank you for your order from {{2}}. Your payment of {{3}} for order {{4}} has gone through, and the shop is preparing it now. We'll message you here when it's on its way.",
    examples: ["Chioma", "Ada's Shop", "₦25,000", "3F9A12BC"],
    footer: CUSTOMER_FOOTER,
    button: chatButton,
  },
  order_received: {
    name: "xyvoo_order_received",
    audience: "customer",
    purpose: "To the shopper after an order paid by bank transfer, on delivery or over WhatsApp.",
    body: "Hi {{1}}, {{2}} has received your order {{3}} for {{4}}. {{5}} We'll message you here when there's news about your order.",
    examples: ["Chioma", "Ada's Shop", "3F9A12BC", "₦25,000", "You'll pay when your order arrives."],
    footer: CUSTOMER_FOOTER,
    button: chatButton,
  },
  payment_received: {
    name: "xyvoo_payment_received",
    audience: "customer",
    purpose: "To the shopper when the shop confirms a bank transfer or other offline payment.",
    body: "Hi {{1}}, {{2}} has received your payment of {{3}} for order {{4}}. We'll message you here when it's on its way.",
    examples: ["Chioma", "Ada's Shop", "₦25,000", "3F9A12BC"],
    footer: CUSTOMER_FOOTER,
    button: chatButton,
  },
  shipped: {
    name: "xyvoo_order_shipped",
    audience: "customer",
    purpose: "To the shopper when the shop marks the order as sent.",
    body: "Hi {{1}}, your order {{2}} from {{3}} is on its way. {{4}} Tap below if you need to contact the shop.",
    examples: ["Chioma", "3F9A12BC", "Ada's Shop", "Tracking number: GIG123456 (GIG Logistics)."],
    footer: CUSTOMER_FOOTER,
    button: chatButton,
  },
  delivered: {
    name: "xyvoo_order_delivered",
    audience: "customer",
    purpose: "To the shopper when the shop marks the order as delivered.",
    body: "Hi {{1}}, {{2}} has marked your order {{3}} as delivered. We hope you enjoy it. If anything isn't right, tap below to contact the shop.",
    examples: ["Chioma", "Ada's Shop", "3F9A12BC"],
    footer: CUSTOMER_FOOTER,
    button: chatButton,
  },
  cancelled: {
    name: "xyvoo_order_cancelled",
    audience: "customer",
    purpose: "To the shopper when the shop cancels the order.",
    body: "Hi {{1}}, {{2}} has cancelled your order {{3}}. {{4}} Tap below if you have any questions.",
    examples: ["Chioma", "Ada's Shop", "3F9A12BC", "You haven't been charged for it."],
    footer: CUSTOMER_FOOTER,
    button: chatButton,
  },
  refunded: {
    name: "xyvoo_order_refunded",
    audience: "customer",
    purpose: "To the shopper when the shop refunds all or part of an order.",
    body: "Hi {{1}}, {{2}} has refunded {{3}} for your order {{4}}. {{5}} Tap below if you have any questions.",
    examples: ["Chioma", "Ada's Shop", "₦5,000", "3F9A12BC", "It goes back to the card or account you paid with. Banks usually take a few working days to show it."],
    footer: CUSTOMER_FOOTER,
    button: chatButton,
  },
  shop_new_order: {
    name: "xyvoo_shop_new_order",
    audience: "shop",
    purpose: "To the shop's alert number for every new order.",
    body: "New order on {{1}}: {{2}} from {{3}} ({{4}}). Payment: {{5}}. Open your orders to confirm and send it.",
    examples: ["Ada's Shop", "₦25,000", "Chioma Okafor", "2 items", "Paid by card"],
    footer: SHOP_FOOTER,
    button: ordersButton,
  },
  shop_paid_cancelled: {
    name: "xyvoo_shop_paid_cancelled",
    audience: "shop",
    purpose: "To the shop's alert number when a payment arrives for an order that was already cancelled.",
    body: "Action needed on {{1}}: {{2}} paid {{3}} for order {{4}} after it was cancelled. Fulfil it if you still have the items, or refund the customer.",
    examples: ["Ada's Shop", "Chioma Okafor", "₦25,000", "3F9A12BC"],
    footer: SHOP_FOOTER,
    button: ordersButton,
  },
} as const satisfies Record<string, WhatsAppTemplate>;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;

/** One line of text, as WhatsApp allows in a variable: no line breaks, tabs or long runs of spaces. */
export function templateParam(value: string, max = 300) {
  const text = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text) || "-";
}

/** The template's body with its variables filled in: the message as the recipient reads it. */
export function renderTemplate(template: WhatsAppTemplate, params: string[]) {
  return template.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "");
}

/** How many variables a template's body has. */
export const templateParamCount = (template: WhatsAppTemplate) => new Set(template.body.match(/\{\{\d+\}\}/g)).size;
