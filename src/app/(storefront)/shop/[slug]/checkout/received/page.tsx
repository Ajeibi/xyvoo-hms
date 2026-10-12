import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ClearBasket from "@/components/storefront-theme/ClearBasket";
import { formatShopCurrency } from "@/lib/shop/format";
import { parseOfflinePayments } from "@/lib/store/offline-payments";
import { orderReference } from "@/lib/store/order-emails";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { whatsappLink } from "@/lib/store/whatsapp";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Order received", robots: { index: false, follow: false } };

/** A recent offline order (last 14 days) and the shop's offline payment settings. */
async function loadOfflineOrder(tenantId: string, orderId: string) {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const db = createServerSupabaseClient().schema("store");
  const [{ data: order }, { data: profile }] = await Promise.all([
    db
      .from("orders")
      .select("id, customer_name, payment_method, total_amount, delivery_method, created_at, order_items(product_name, quantity, line_total)")
      .eq("tenant_id", tenantId)
      .eq("id", orderId)
      .neq("payment_method", "Card")
      .gte("created_at", since)
      .maybeSingle(),
    db.from("business_profile").select("offline_payments").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  return { order, profile };
}

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

  const { order, profile } = await loadOfflineOrder(storefront.tenant.id, orderId);
  if (!order) notFound();

  const { basePath, storeName, profile: shop } = storefront;
  const money = (v: number) => formatShopCurrency(v, shop.currencyCode);
  const reference = orderReference(order.id);
  const items = (order.order_items as { product_name: string; quantity: number; line_total: number }[]) || [];
  const total = money(Number(order.total_amount) || 0);
  const offline = parseOfflinePayments(profile?.offline_payments);
  const bank = offline.bankTransfer;
  const whatsappMessage = [
    `Hello ${storeName}, I've just placed order ${reference}:`,
    ...items.map((i) => `${i.quantity} × ${i.product_name}`),
    `Total: ${total}`,
    `Name: ${order.customer_name}`,
  ].join("\n");
  const whatsapp = whatsappLink(shop.whatsapp, whatsappMessage, shop.countryCode);

  return (
    <div className="container section">
      <ClearBasket />
      <h1 className="h-page">Thank you, we&rsquo;ve got your order</h1>
      <p className="body-copy">
        Your order reference is <strong>{reference}</strong>. Please keep it in case you need to contact {storeName}.
      </p>

      <div className="payment-box" style={{ marginTop: "1.5rem" }}>
        {order.payment_method === "Bank Transfer" && bank.enabled ? (
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
          </>
        ) : order.payment_method === "Pay on Delivery" ? (
          <>
            <h2 className="h-section">Pay when it arrives</h2>
            <p>
              Please have <strong>{total}</strong> ready when your order is delivered.
            </p>
            {offline.payOnDelivery.note ? <p>{offline.payOnDelivery.note}</p> : null}
          </>
        ) : (
          <>
            <h2 className="h-section">Send your order on WhatsApp</h2>
            <p>Tap the button to send your order to {storeName} on WhatsApp. They&rsquo;ll reply to arrange payment and delivery.</p>
            {whatsapp ? (
              <a className="btn btn--primary" href={whatsapp} target="_blank" rel="noreferrer">
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
          {order.delivery_method ? (
            <li>
              <span>Delivery: {order.delivery_method}</span>
              <span />
            </li>
          ) : null}
          <li className="order-received__total">
            <span>Total</span>
            <span>{total}</span>
          </li>
        </ul>
      </section>

      <p style={{ marginTop: "2rem" }}>
        <Link className="link-arrow" href={storeHref(basePath, STORE_PATHS.products)}>
          Continue shopping
        </Link>
      </p>
    </div>
  );
}
