import OrderUpdatesPush from "@/components/storefront-theme/OrderUpdatesPush";
import PaymentProofUpload from "@/components/storefront-theme/PaymentProofUpload";
import type { Metadata } from "next";
import Link from "next/link";
import { FaWhatsapp } from "react-icons/fa6";
import { notFound } from "next/navigation";
import ClearBasket from "@/components/storefront-theme/ClearBasket";
import { TrackPurchase } from "@/components/storefront-theme/StoreAnalytics";
import { formatShopCurrency } from "@/lib/shop/format";
import { parseOfflinePayments } from "@/lib/store/offline-payments";
import { purchaseLines } from "@/lib/store/product-feed";
import { orderReference } from "@/lib/store/order-emails";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { whatsappLink, whatsappOrderMessage } from "@/lib/store/whatsapp";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Order received", robots: { index: false, follow: false } };

/** A recent offline order (last 14 days) and the shop's offline payment settings. */
async function loadOfflineOrder(tenantId: string, orderId: string) {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const db = createServerSupabaseClient().schema("store");
  const [{ data: order }, { data: profile }] = await Promise.all([
    db
      .from("orders")
      .select(
        "id, customer_name, customer_email, customer_phone, shipping_address, payment_method, payment_status, total_amount, delivery_fee, delivery_method, discount_code, discount_amount, gift_card_amount, created_at, order_items(product_id, variant_id, product_name, quantity, unit_price, line_total)",
      )
      .eq("tenant_id", tenantId)
      .eq("id", orderId)
      .neq("payment_method", "Card")
      .gte("created_at", since)
      .maybeSingle(),
    db.from("business_profile").select("offline_payments").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  // Tax and points are read on their own, so the page still works on a database without those columns.
  const [tax, points] = order
    ? await Promise.all([
        db.from("orders").select("tax_amount, tax_inclusive").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle(),
        db.from("orders").select("loyalty_amount").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle(),
      ])
    : [null, null];
  // Separate too: whether the shopper has already sent proof of a bank transfer.
  const proof = order ? await db.from("orders").select("payment_proof_uploaded_at").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle() : null;
  const extras = {
    taxAmount: Number((tax?.data as { tax_amount?: unknown } | null)?.tax_amount) || 0,
    taxInclusive: Boolean((tax?.data as { tax_inclusive?: unknown } | null)?.tax_inclusive),
    pointsAmount: Number((points?.data as { loyalty_amount?: unknown } | null)?.loyalty_amount) || 0,
    proofSent: Boolean((proof?.data as { payment_proof_uploaded_at?: unknown } | null)?.payment_proof_uploaded_at),
  };
  // Each item's page address and size or colour, so the WhatsApp message can link to it.
  const productIds = [...new Set(((order?.order_items as { product_id: string | null }[] | undefined) || []).map((i) => i.product_id).filter((id): id is string => !!id))];
  const { data: products } = productIds.length
    ? await db.from("products").select("id, slug, product_variants(id, options)").eq("tenant_id", tenantId).in("id", productIds)
    : { data: [] };
  return { order, profile, extras, products: (products || []) as unknown as ProductRef[] };
}

type ProductRef = { id: string; slug: string | null; product_variants: { id: string; options: Record<string, string> | null }[] | null };

/**
 * After an offline order: what to do next (bank details, pay on delivery, or
 * send the order on WhatsApp). Only recent offline orders are shown, by their
 * unguessable id, so this page can't be used to look up other orders.
 */
export default async function OrderReceivedPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ order?: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) notFound();
  const orderId = (await searchParams).order ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();

  const { order, profile, extras, products } = await loadOfflineOrder(storefront.tenant.id, orderId);
  if (!order) notFound();

  const { basePath, storeName, profile: shop } = storefront;
  const money = (v: number) => formatShopCurrency(v, shop.currencyCode);
  const reference = orderReference(order.id);
  const items = (order.order_items as { product_id: string | null; variant_id: string | null; product_name: string; quantity: number; unit_price: number; line_total: number }[]) || [];
  const total = money(Number(order.total_amount) || 0);
  const offline = parseOfflinePayments(profile?.offline_payments);
  const bank = offline.bankTransfer;
  const lineDetails = items.map((i) => {
    const product = products.find((p) => p.id === i.product_id);
    const variant = i.variant_id ? product?.product_variants?.find((v) => v.id === i.variant_id) : null;
    const path = product?.slug ? storeHref(storefront.siteUrl, `${STORE_PATHS.product(product.slug)}${i.variant_id ? `?variant=${i.variant_id}` : ""}`) : null;
    return {
      quantity: i.quantity,
      name: i.product_name,
      variantLabel: variant?.options ? Object.values(variant.options).join(" · ") : null,
      unitPrice: money(Number(i.unit_price) || 0),
      lineTotal: money(Number(i.line_total) || 0),
      url: path,
    };
  });
  const address = order.shipping_address as { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string } | null;
  const addressText = [address?.line1, address?.line2, address?.city, address?.state, address?.postalCode].filter(Boolean).join(", ");
  const subtotal = items.reduce((n, i) => n + (Number(i.line_total) || 0), 0);
  const deliveryFee = Number(order.delivery_fee) || 0;
  const discount = Number(order.discount_amount) || 0;
  const giftCard = Number(order.gift_card_amount) || 0;
  const { taxAmount, taxInclusive, pointsAmount } = extras;
  // Every line between the items and the total, so the summary adds up.
  const summaryLines = [
    { label: "Subtotal", value: money(subtotal) },
    ...(discount > 0 ? [{ label: `Discount${order.discount_code ? ` (${order.discount_code})` : ""}`, value: `−${money(discount)}` }] : []),
    ...(order.delivery_method ? [{ label: `Delivery: ${order.delivery_method}`, value: deliveryFee > 0 ? money(deliveryFee) : "Free" }] : []),
    ...(taxAmount > 0 && !taxInclusive ? [{ label: "Tax", value: money(taxAmount) }] : []),
    ...(giftCard > 0 ? [{ label: "Paid with gift card", value: `−${money(giftCard)}` }] : []),
    ...(pointsAmount > 0 ? [{ label: "Paid with points", value: `−${money(pointsAmount)}` }] : []),
  ];
  // Nothing left to pay: a discount or gift card (and points) covered the whole order.
  const fullyPaid = order.payment_status === "paid";
  const whatsappMessage = whatsappOrderMessage({
    storeName,
    reference,
    items: lineDetails,
    // The delivery method has its own line in the message, so here it's just the charge.
    extras: summaryLines.map((l) => (l.label.startsWith("Delivery:") ? { ...l, label: "Delivery" } : l)),
    total,
    deliveryMethod: order.delivery_method,
    customer: { name: order.customer_name, phone: order.customer_phone, email: order.customer_email, address: addressText || null },
  });
  const whatsapp = whatsappLink(shop.whatsapp, whatsappMessage, shop.countryCode);

  return (
    <div className="container section">
      <ClearBasket />
      {/* A sale for the ad pixels only once it's paid: bank transfer, pay on delivery and WhatsApp orders aren't yet. */}
      {fullyPaid ? <TrackPurchase orderId={order.id} total={Number(order.total_amount) || 0} lines={purchaseLines(items)} /> : null}
      <h1 className="h-page">Thank you, we&rsquo;ve got your order</h1>
      <p className="body-copy">
        Your order reference is <strong>{reference}</strong>. Please keep it in case you need to contact {storeName}.
      </p>
      <OrderUpdatesPush orderId={order.id} />

      <div className="payment-box" style={{ marginTop: "1.5rem" }}>
        {fullyPaid ? (
          <>
            <h2 className="h-section">Nothing more to pay</h2>
            <p>
              Your {giftCard > 0 ? "gift card" : pointsAmount > 0 ? "points" : "discount"} covered the whole order. We&rsquo;ve emailed you a confirmation, and {storeName} will
              let you know when it&rsquo;s on its way.
            </p>
          </>
        ) : order.payment_method === "Bank Transfer" && bank.enabled ? (
          <>
            <h2 className="h-section">Pay by bank transfer</h2>
            <p>
              Please transfer <strong>{total}</strong> to:
            </p>
            <dl className="order-received__bank">
              <dt>Bank</dt>
              <dd>{bank.bankName}</dd>
              <dt>Account name</dt>
              <dd>{bank.accountName}</dd>
              <dt>Account number</dt>
              <dd>
                <strong>{bank.accountNumber}</strong>
              </dd>
              <dt>Reference</dt>
              <dd>
                <strong>{reference}</strong>
              </dd>
            </dl>
            {bank.note ? <p>{bank.note}</p> : null}
            <p>{storeName} will confirm your order once your payment arrives. We&rsquo;ve also emailed you these details.</p>
            {order.payment_status === "unpaid" ? <PaymentProofUpload orderId={order.id} storeName={storeName} alreadySent={extras.proofSent} /> : null}
          </>
        ) : order.payment_method === "Pay on Delivery" ? (
          <>
            <h2 className="h-section">Pay when it arrives</h2>
            <p>
              Please have <strong>{total}</strong> ready when your order is delivered.
            </p>
            {offline.payOnDelivery.note ? <p>{offline.payOnDelivery.note}</p> : null}
          </>
        ) : order.payment_method !== "WhatsApp" ? (
          <>
            <h2 className="h-section">What happens next</h2>
            <p>{storeName} will be in touch to arrange payment. We&rsquo;ve emailed you the details of your order.</p>
          </>
        ) : (
          <>
            <h2 className="h-section">Send your order on WhatsApp</h2>
            <p>Tap the button to send your order to {storeName} on WhatsApp. They&rsquo;ll reply to arrange payment and delivery.</p>
            {whatsapp ? (
              <a className="btn btn--whatsapp" href={whatsapp} target="_blank" rel="noreferrer">
                <FaWhatsapp aria-hidden />
                Send order on WhatsApp <span className="visually-hidden">(opens WhatsApp)</span>
              </a>
            ) : (
              <p>{storeName} will contact you shortly.</p>
            )}
          </>
        )}
      </div>

      <section aria-labelledby="received-summary" style={{ marginTop: "2rem" }}>
        <h2 id="received-summary" className="h-section">
          Your order
        </h2>
        <ul className="order-received__items">
          {items.map((i, n) => (
            <li key={`${i.product_name}-${n}`}>
              <span>
                {i.quantity} × {i.product_name}
              </span>
              <span>{money(Number(i.line_total) || 0)}</span>
            </li>
          ))}
          {summaryLines.map((l) => (
            <li key={l.label}>
              <span>{l.label}</span>
              <span>{l.value}</span>
            </li>
          ))}
          <li className="order-received__total">
            <span>{fullyPaid ? "Paid" : "To pay"}</span>
            <span>{total}</span>
          </li>
        </ul>
        {taxAmount > 0 && taxInclusive ? <p className="hint">Includes tax of {money(taxAmount)}</p> : null}
      </section>

      <p style={{ marginTop: "2rem" }}>
        <Link className="link-arrow" href={storeHref(basePath, STORE_PATHS.products)}>
          Continue shopping
        </Link>
      </p>
    </div>
  );
}
