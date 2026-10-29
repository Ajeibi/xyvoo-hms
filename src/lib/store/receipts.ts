import { badge, detailsPanel, EMAIL_SITE_URL, escapeHtml } from "@/lib/mail/layout";
import { sendBrandedEmail, type EmailAttachment } from "@/lib/mail/mailtrap";
import { formatShopCurrency } from "@/lib/shop/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { storeTimezone } from "./analytics";
import { parseOfflinePayments, type OfflinePayments } from "./offline-payments";
import { TaggedPdf, type TableCell } from "./receipts-pdf";
import { emailLanguage, translatorFor } from "./i18n/shopper";
import type { ShopLanguage } from "./i18n/languages";
import type { Translator } from "./i18n/translate";
import {
  dateLocale,
  describeVariantOptions,
  fileSlug,
  formatDocumentDate,
  formatReceiptNumber,
  isReceiptToken,
  pdfMoney,
  receiptKindFor,
  type ReceiptKind,
} from "./receipts-format";
import { storefrontUrl } from "./subdomain";

/*
 * Receipts for paid orders and invoices for bank transfer orders awaiting
 * payment, made on demand as PDFs. Receipt numbers come from the database
 * (store.orders.receipt_number, see the receipts migration). Shoppers open
 * theirs with the order's random receipt_token; shop members by order id.
 */

const ORDER_COLUMNS =
  "id, tenant_id, customer_name, customer_email, customer_phone, status, payment_status, payment_method, total_amount, delivery_fee, delivery_method, discount_code, discount_amount, gift_card_amount, shipping_address, created_at, paid_at, receipt_number, receipt_token, order_items(product_name, quantity, unit_price, line_total, variant_id, created_at)";

type OrderRow = {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  total_amount: number | string;
  delivery_fee: number | string | null;
  delivery_method: string | null;
  discount_code: string | null;
  discount_amount: number | string | null;
  gift_card_amount?: number | string | null;
  shipping_address: Record<string, unknown> | null;
  created_at: string;
  paid_at: string | null;
  receipt_number: number | string | null;
  receipt_token: string | null;
  order_items: { product_name: string; quantity: number; unit_price: number | string; line_total: number | string; variant_id: string | null; created_at: string }[] | null;
};

export type ReceiptData = {
  kind: ReceiptKind;
  number: string | null;
  token: string | null;
  reference: string;
  orderId: string;
  tenantId: string;
  slug: string;
  storeName: string;
  logoUrl: string | null;
  shop: { email: string | null; phone: string | null; address: string[]; taxName: string | null; taxNumber: string | null };
  currency: string;
  timezone: string;
  customer: { name: string; email: string | null; phone: string | null; address: string[] };
  deliveryMethod: string | null;
  items: { name: string; options: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: { code: string | null; amount: number };
  /** Paid with a gift card (taken off what's left to pay). */
  giftCard: number;
  deliveryFee: number;
  tax: { amount: number; rate: number | null; inclusive: boolean } | null;
  total: number;
  /** Money given back to the customer so far. */
  refunded: number;
  paymentMethod: string | null;
  createdAt: string;
  paidAt: string | null;
  bank: OfflinePayments["bankTransfer"] | null;
  /** The shopper's language: the one saved with the order, if the shop still offers it. */
  lang: ShopLanguage;
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const reference = (orderId: string) => orderId.slice(0, 8).toUpperCase();

/** The shopper's link to their receipt or invoice. */
export const receiptUrl = (token: string) => `${EMAIL_SITE_URL}/api/receipts/${token}`;

/** Tax rate as a percentage, accepting a fraction (0.075) or a percentage (7.5). */
/** orders.tax_rate is stored as a percentage (7.5 means 7.5%), as checkout saves it. */
function taxPercent(rate: unknown) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  return r;
}

async function loadOrder(where: { tenantId: string; orderId: string } | { token: string }) {
  const db = createServerSupabaseClient().schema("store");
  let query = db.from("orders").select(ORDER_COLUMNS);
  query = "token" in where ? query.eq("receipt_token", where.token) : query.eq("tenant_id", where.tenantId).eq("id", where.orderId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[receipts] order not loaded", error.message);
    return null;
  }
  return (data as OrderRow | null) ?? null;
}

/** Everything a receipt or invoice shows, or null when the order has no document (yet). */
export async function loadReceiptData(where: { tenantId: string; orderId: string } | { token: string }): Promise<ReceiptData | null> {
  if ("token" in where && !isReceiptToken(where.token)) return null;
  const order = await loadOrder(where);
  if (!order) return null;
  const kind = receiptKindFor(order);
  if (!kind) return null;

  const service = createServerSupabaseClient();
  const db = service.schema("store");
  const tenantId = order.tenant_id;
  const variantIds = [...new Set((order.order_items || []).map((i) => i.variant_id).filter((v): v is string => Boolean(v)))];

  const [{ data: profile }, { data: tenant }, variants, tax, taxProfile, number, refund, language] = await Promise.all([
    db
      .from("business_profile")
      .select("business_email, phone, whatsapp, address_line1, address_line2, city, state, postcode, country_code, currency_code, offline_payments")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    service.from("tenants").select("subdomain, name, display_name, logo_url").eq("id", tenantId).maybeSingle(),
    variantIds.length ? db.from("product_variants").select("id, options").in("id", variantIds) : Promise.resolve({ data: [] as { id: string; options: unknown }[] }),
    // Tax columns arrive with the pricing work; until then there's no tax line.
    db.from("orders").select("tax_amount, tax_rate, tax_inclusive").eq("tenant_id", tenantId).eq("id", order.id).maybeSingle(),
    // The VAT name and number saved on the order when it was placed, else the shop's current ones.
    db.from("orders").select("tax_name, tax_number").eq("tenant_id", tenantId).eq("id", order.id).maybeSingle().then(async (atSale) => {
      const saved = atSale.error ? null : (atSale.data as { tax_name?: string | null; tax_number?: string | null } | null);
      if (saved?.tax_number) return { data: saved, error: null };
      return db.from("business_profile").select("tax_name, tax_number").eq("tenant_id", tenantId).maybeSingle();
    }),
    kind === "receipt" && !order.receipt_number
      ? db.rpc("ensure_receipt_number", { p_tenant_id: tenantId, p_order_id: order.id }).then((r) => (r.error ? null : r.data))
      : Promise.resolve(order.receipt_number),
    // Refunds arrive with the orders work; until then nothing is shown as refunded.
    db.from("orders").select("refunded_amount").eq("tenant_id", tenantId).eq("id", order.id).maybeSingle(),
    // The shopper's language arrives with a migration; until then the shop's main language.
    db.from("orders").select("language").eq("tenant_id", tenantId).eq("id", order.id).maybeSingle().then(
      (r) => emailLanguage(tenantId, r.error ? null : (r.data as { language?: unknown } | null)?.language),
      () => emailLanguage(tenantId, null),
    ),
  ]);
  if (!tenant) return null;

  const optionsById = new Map(((variants.data || []) as { id: string; options: unknown }[]).map((v) => [v.id, describeVariantOptions(v.options)]));
  const items = [...(order.order_items || [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((i) => ({
      name: i.product_name,
      options: i.variant_id ? optionsById.get(i.variant_id) || "" : "",
      quantity: num(i.quantity),
      unitPrice: num(i.unit_price),
      lineTotal: num(i.line_total),
    }));

  const taxRow = tax.error ? null : (tax.data as { tax_amount?: unknown; tax_rate?: unknown; tax_inclusive?: unknown } | null);
  const taxAmount = num(taxRow?.tax_amount);
  const taxNames = taxProfile.error ? null : (taxProfile.data as { tax_name?: string | null; tax_number?: string | null } | null);
  const address = (a: Record<string, unknown> | null | undefined, keys: string[]) =>
    keys.map((k) => (typeof a?.[k] === "string" ? (a[k] as string).trim() : "")).filter(Boolean);
  const offline = parseOfflinePayments(profile?.offline_payments);
  const shopAddress = address(profile as Record<string, unknown> | null, ["address_line1", "address_line2", "city", "state", "postcode"]);

  return {
    kind,
    number: kind === "receipt" ? formatReceiptNumber(number as number | null) : null,
    token: order.receipt_token,
    reference: reference(order.id),
    orderId: order.id,
    tenantId,
    slug: String(tenant.subdomain || tenant.name),
    storeName: (tenant.display_name as string | null)?.trim() || String(tenant.subdomain || tenant.name),
    logoUrl: (tenant.logo_url as string | null) || null,
    shop: {
      email: (profile?.business_email as string | null) || null,
      phone: (profile?.phone as string | null) || (profile?.whatsapp as string | null) || null,
      address: shopAddress.length ? [shopAddress.join(", ")] : [],
      taxName: taxNames?.tax_name?.trim() || null,
      taxNumber: taxNames?.tax_number?.trim() || null,
    },
    currency: (profile?.currency_code as string | null) || "NGN",
    timezone: storeTimezone(profile?.country_code as string | null),
    customer: {
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      address: address(order.shipping_address, ["line1", "line2", "city", "state", "postcode", "country"]),
    },
    deliveryMethod: order.delivery_method,
    items,
    subtotal: items.reduce((s, i) => s + i.lineTotal, 0),
    discount: { code: order.discount_code, amount: num(order.discount_amount) },
    giftCard: num(order.gift_card_amount),
    deliveryFee: num(order.delivery_fee),
    tax: taxAmount > 0 ? { amount: taxAmount, rate: taxPercent(taxRow?.tax_rate), inclusive: Boolean(taxRow?.tax_inclusive) } : null,
    total: num(order.total_amount),
    refunded: refund.error ? 0 : num((refund.data as { refunded_amount?: unknown } | null)?.refunded_amount),
    paymentMethod: order.payment_method,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    bank: kind === "invoice" && offline.bankTransfer.enabled ? offline.bankTransfer : null,
    lang: language,
  };
}

/** How the order was paid, in words (in the receipt's language). */
export function paymentSentence(method: string | null, paidOn: string, t: Translator = translatorFor("en")) {
  const on = paidOn ? t("emails.payOn", { date: paidOn }) : "";
  switch (method) {
    case "Card":
      return t("emails.payCard", { on });
    case "Bank Transfer":
      return t("emails.payBankTransfer", { on });
    case "Pay on Delivery":
      return t("emails.payOnDelivery", { on });
    case "WhatsApp":
      return t("emails.payWhatsapp", { on });
    case "Discount":
      return t("emails.payDiscount", { on });
    case "Gift card":
      return t("emails.payGiftCard", { on });
    default:
      return method ? t("emails.payOther", { method: method.toLowerCase(), on }) : t("emails.payPlain", { on });
  }
}

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
  } catch {
    return "";
  }
})();

/** The shop's logo as PNG or JPEG bytes, only from our own image storage, or null. */
/** A shop or hotel logo from Supabase storage, as PNG or JPEG bytes for a PDF, or null. */
export async function fetchLogo(url: string | null) {
  if (!url || !SUPABASE_HOST) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== SUPABASE_HOST) return null;
    const res = await fetch(parsed, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 2_000_000) return null;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    return isPng ? { bytes, type: "png" as const } : isJpeg ? { bytes, type: "jpg" as const } : null;
  } catch {
    return null;
  }
}

/** The PDF for a receipt or invoice, in the shopper's language (the order's). */
export async function renderReceiptPdf(r: ReceiptData) {
  const t = translatorFor(r.lang);
  const shop = r.storeName;
  const ref = r.reference;
  const isReceipt = r.kind === "receipt";
  const title = isReceipt
    ? r.number
      ? t("emails.pdfReceiptTitle", { number: r.number, shop })
      : t("emails.pdfReceiptTitleNoNumber", { shop })
    : t("emails.pdfInvoiceTitle", { ref, shop });
  const locale = dateLocale(r.lang);
  const pdf = await TaggedPdf.create({
    title,
    subject: isReceipt ? t("emails.pdfReceiptSubject", { ref }) : t("emails.pdfInvoiceSubject", { ref }),
    author: r.storeName,
    lang: locale,
  });
  const money = (v: number) => pdfMoney(v, r.currency);
  const docDate = formatDocumentDate(isReceipt ? r.paidAt || r.createdAt : r.createdAt, r.timezone, locale);

  // ---- Shop
  const logo = await fetchLogo(r.logoUrl);
  let textX = pdf.left;
  const top = pdf.y;
  if (logo) {
    try {
      const image = logo.type === "png" ? await pdf.doc.embedPng(logo.bytes) : await pdf.doc.embedJpg(logo.bytes);
      const { width } = pdf.figure(image, t("emails.pdfLogo", { shop }), 48, 120);
      textX = pdf.left + width + 14;
    } catch {
      // An unreadable logo just isn't shown.
    }
  }
  const textWidth = pdf.right - textX;
  pdf.paragraph(r.storeName, { size: 15, bold: true, x: textX, width: textWidth, after: 2 });
  const contact = [...r.shop.address, [r.shop.phone, r.shop.email].filter(Boolean).join("  ·  ")].filter(Boolean);
  for (const line of contact) pdf.paragraph(line, { size: 9.5, muted: true, x: textX, width: textWidth, after: 1 });
  if (r.shop.taxNumber) {
    pdf.paragraph(t("emails.pdfTaxNumber", { tax: r.shop.taxName || t("emails.pdfTax"), number: r.shop.taxNumber }), { size: 9.5, muted: true, x: textX, width: textWidth, after: 1 });
  }
  if (logo) pdf.y = Math.min(pdf.y, top - 52);
  pdf.rule(10);

  // ---- Title and details
  pdf.heading(isReceipt ? t("emails.pdfReceipt") : t("emails.pdfInvoice"), 1);
  const details: TableCell[][] = [
    ...(isReceipt ? [[t("emails.pdfReceiptNumber"), r.number || t("emails.pdfNotNumbered")]] : [[t("emails.pdfInvoiceFor"), r.reference]]),
    [isReceipt ? t("emails.pdfDatePaid") : t("emails.pdfInvoiceDate"), docDate],
    ...(isReceipt ? [[t("emails.pdfOrderReference"), r.reference]] : []),
    [t("emails.pdfOrderPlaced"), formatDocumentDate(r.createdAt, r.timezone, locale)],
    ...(isReceipt ? [[t("emails.pdfPayment"), paymentSentence(r.paymentMethod, docDate, t)]] : [[t("emails.pdfAmountDue"), { text: money(r.total), bold: true }]]),
  ];
  pdf.table(
    [
      { header: t("emails.pdfDetail"), width: 150 },
      { header: t("emails.pdfValue"), width: pdf.contentWidth - 150 },
    ],
    details,
    { headerRow: false, rowHeaders: true, size: 10 },
  );

  // ---- Customer
  pdf.heading(isReceipt ? t("emails.pdfCustomer") : t("emails.pdfBilledTo"));
  pdf.paragraph(r.customer.name, { bold: true, after: 1 });
  for (const line of [r.customer.address.join(", "), [r.customer.phone, r.customer.email].filter(Boolean).join("  ·  ")].filter(Boolean)) {
    pdf.paragraph(line, { size: 10, muted: true, after: 1 });
  }
  if (r.deliveryMethod) pdf.paragraph(t("emails.pdfDeliveryLine", { method: r.deliveryMethod }), { size: 10, muted: true, after: 1 });

  // ---- Items
  pdf.heading(t("emails.pdfItems"));
  const qtyW = 50;
  const priceW = 100;
  const amountW = 105;
  pdf.table(
    [
      { header: t("emails.pdfItem"), width: pdf.contentWidth - qtyW - priceW - amountW },
      { header: t("emails.pdfQty"), width: qtyW, align: "right" },
      { header: t("emails.pdfUnitPrice"), width: priceW, align: "right" },
      { header: t("emails.pdfAmount"), width: amountW, align: "right" },
    ],
    r.items.map((i) => [{ text: i.name, note: i.options || undefined }, String(i.quantity), money(i.unitPrice), money(i.lineTotal)]),
    { size: 10, zebra: true },
  );

  // ---- Totals
  const taxLabel = r.tax ? `${r.shop.taxName || t("emails.pdfTax")}${r.tax.rate ? ` (${r.tax.rate}%)` : ""}` : "";
  const totalLabel = isReceipt ? t("emails.labelTotalPaid") : t("emails.pdfTotalToPay");
  const delivery = t("emails.labelDelivery");
  const totals: TableCell[][] = [
    [t("emails.pdfSubtotal"), money(r.subtotal)],
    ...(r.discount.amount > 0 ? [[r.discount.code ? t("emails.discountCode", { code: r.discount.code }) : t("emails.discount"), money(-r.discount.amount)]] : []),
    ...(r.deliveryFee > 0 ? [[delivery, money(r.deliveryFee)]] : r.deliveryMethod ? [[delivery, t("emails.pdfFree")]] : []),
    ...(r.tax && !r.tax.inclusive ? [[taxLabel, money(r.tax.amount)]] : []),
    ...(r.giftCard > 0 ? [[t("emails.paidWithGiftCard"), money(-r.giftCard)]] : []),
    [totalLabel, money(r.total)],
    ...(r.tax && r.tax.inclusive ? [[t("emails.pdfIncludes", { tax: taxLabel }), money(r.tax.amount)]] : []),
    ...(isReceipt && r.refunded > 0
      ? [
          [t("emails.pdfRefundedToYou"), money(-r.refunded)],
          [t("emails.pdfPaidAfterRefunds"), money(Math.max(0, r.total - r.refunded))],
        ]
      : []),
  ];
  const totalsIndex = totals.findIndex((row) => row[0] === totalLabel);
  totals[totalsIndex] = totals[totalsIndex].map((c) => ({ text: typeof c === "string" ? c : c.text, bold: true }));
  pdf.table(
    [
      { header: t("emails.pdfSummary"), width: pdf.contentWidth - 160 },
      { header: t("emails.pdfAmount"), width: 160, align: "right" },
    ],
    totals,
    { headerRow: false, rowHeaders: true, size: 10.5 },
  );

  // ---- Paying an invoice
  if (!isReceipt) {
    pdf.heading(t("emails.pdfHowToPay"));
    if (r.bank) {
      pdf.paragraph(t("emails.pdfPayByBank", { total: money(r.total), ref, shop }));
      pdf.table(
        [
          { header: t("emails.pdfBankDetail"), width: 150 },
          { header: t("emails.pdfValue"), width: pdf.contentWidth - 150 },
        ],
        [
          [t("emails.pdfBank"), r.bank.bankName],
          [t("emails.pdfAccountName"), r.bank.accountName],
          [t("emails.pdfAccountNumber"), r.bank.accountNumber],
          [t("emails.pdfPaymentReference"), { text: r.reference, bold: true }],
        ],
        { headerRow: false, rowHeaders: true },
      );
      if (r.bank.note) pdf.paragraph(r.bank.note, { size: 10, muted: true });
    } else {
      pdf.paragraph(t("emails.pdfAskForBank", { shop, ref }));
    }
    pdf.paragraph(t("emails.pdfConfirmWhenPaid", { shop }), { size: 10, muted: true });
  }

  pdf.rule(10);
  pdf.paragraph(isReceipt ? t("emails.pdfThanksReceipt", { shop }) : t("emails.pdfThanksInvoice", { shop }), { bold: true });
  const ask = r.shop.email || r.shop.phone;
  if (ask) pdf.paragraph(t("emails.pdfQuestions", { shop, contact: ask, ref }), { size: 10, muted: true });

  const footer = `${isReceipt ? r.number || t("emails.pdfReceipt") : t("emails.pdfInvoice")} · ${r.storeName}`;
  const bytes = await pdf.save(footer, (page, total) => t("emails.pdfPage", { page, total }));
  const filename = `${fileSlug(r.storeName)}-${isReceipt ? (r.number || `receipt-${r.reference}`).toLowerCase() : `invoice-${r.reference.toLowerCase()}`}.pdf`;
  return { bytes, filename };
}

/** The receipt or invoice for an order, as a PDF file, or null when it has none (or it couldn't be made). */
export async function buildReceiptPdf(where: { tenantId: string; orderId: string } | { token: string }) {
  try {
    const data = await loadReceiptData(where);
    if (!data) return null;
    return { ...(await renderReceiptPdf(data)), data };
  } catch (error) {
    console.error("[receipts] PDF not made", error);
    return null;
  }
}

/**
 * For the "Payment received" emails: the receipt as an attachment, and the
 * shopper's link to it. Null if there's no receipt (the email still goes).
 */
export async function receiptForEmail(tenantId: string, orderId: string): Promise<{ url: string | null; number: string | null; attachments: EmailAttachment[] } | null> {
  const built = await buildReceiptPdf({ tenantId, orderId });
  if (!built || built.data.kind !== "receipt") return null;
  return {
    url: built.data.token ? receiptUrl(built.data.token) : null,
    number: built.data.number,
    attachments: [{ filename: built.filename, content: built.bytes, contentType: "application/pdf" }],
  };
}

/** For the order-received email: the link to a bank transfer order's invoice, or null. */
export async function invoiceUrlFor(tenantId: string, orderId: string) {
  try {
    const { data } = await createServerSupabaseClient()
      .schema("store")
      .from("orders")
      .select("receipt_token, payment_status, status, payment_method")
      .eq("tenant_id", tenantId)
      .eq("id", orderId)
      .maybeSingle();
    if (!data?.receipt_token || receiptKindFor(data) !== "invoice") return null;
    return receiptUrl(String(data.receipt_token));
  } catch {
    return null;
  }
}

/**
 * The shopper's receipt email, for orders the shop marks as paid (bank
 * transfer, pay on delivery, WhatsApp) from the dashboard: a thank-you with
 * the receipt attached and a link to it. Card payments get theirs in
 * sendOrderPaidEmails. Never throws; a failed email mustn't affect the order.
 */
export async function sendReceiptEmail(tenantId: string, orderId: string) {
  try {
    const built = await buildReceiptPdf({ tenantId, orderId });
    if (!built || built.data.kind !== "receipt") return;
    const r = built.data;
    if (!r.customer.email) return;
    const money = (v: number) => formatShopCurrency(v, r.currency);
    const total = money(r.total);
    const url = r.token ? receiptUrl(r.token) : null;
    // In the language the shopper ordered in, like the attached receipt.
    const t = translatorFor(r.lang);
    const shop = r.storeName;
    const ref = r.reference;
    const nextStep = t("emails.preparingOrder", { shop });
    const itemLines = r.items.map((i) => `${i.quantity} × ${i.name}${i.options ? ` (${i.options})` : ""}`);
    await sendBrandedEmail({
      to: r.customer.email,
      subject: t("emails.receiptSubject", { ref, shop }),
      replyTo: r.shop.email,
      text: [
        t("emails.receiptTextIntro", { name: r.customer.name, shop, total }),
        "",
        r.number ? t("emails.orderReceiptLine", { ref, number: r.number }) : t("emails.orderLine", { ref }),
        ...itemLines,
        `${t("emails.labelTotalPaid")}: ${total}`,
        "",
        t("emails.receiptAttached"),
        ...(url ? [`${t("emails.viewReceipt")}: ${url}`] : []),
        "",
        nextStep,
      ].join("\n"),
      layout: {
        lang: t.lang,
        helpCentre: t("emails.helpCentre"),
        preheader: t("emails.receiptPreheader", { ref, shop, total }),
        badges: [badge(t("emails.badgePaid"), "green")],
        title: t("emails.receiptTitle"),
        intro: `${t("emails.receiptIntro", { name: r.customer.name, shop })} ${t("emails.receiptAttached")}`,
        body: `${detailsPanel([
          { label: t("emails.labelOrder"), value: r.reference },
          ...(r.number ? [{ label: t("emails.labelReceipt"), value: r.number }] : []),
          ...r.items.map((i) => ({ label: `${i.quantity} ×`, value: `${i.name}${i.options ? ` (${i.options})` : ""}` })),
          { label: t("emails.labelTotalPaid"), value: total },
        ])}
        <p style="margin:20px 0 0;color:#1e293b;font-size:15px;line-height:1.6"><strong>${escapeHtml(t("emails.whatHappensNext"))}</strong><br>${escapeHtml(nextStep)}</p>`,
        buttons: [...(url ? [{ label: t("emails.viewReceipt"), href: url }] : []), { label: t("emails.visitShop", { shop }), href: storefrontUrl(r.slug), variant: "secondary" as const }],
        footerNote: t("emails.footerOrder", { shop }),
      },
      attachments: [{ filename: built.filename, content: built.bytes, contentType: "application/pdf" }],
    });
  } catch (error) {
    console.error("[receipts] receipt email not sent", { orderId, error });
  }
}
