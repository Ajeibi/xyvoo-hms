"use client";

import { clearCheckoutDetails, setBasketCode } from "@/lib/shop/basket-code";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import { formatShopCurrency } from "@/lib/shop/format";
import { clearCheckoutToken } from "@/lib/store/analytics-client";
import { STORE_PATHS } from "@/lib/store/site/links";
import { useStorefront } from "./StorefrontProvider";
import { Icon } from "./primitives";
import { TrackPurchase } from "./StoreAnalytics";
import { purchaseLines } from "@/lib/store/product-feed";

type OrderSummary = {
  id: string;
  customer_name: string;
  total_amount: number;
  delivery_fee: number | null;
  delivery_method: string | null;
  discount_code: string | null;
  discount_amount: number | null;
  gift_card_amount: number | null;
  shipping_address: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string } | null;
  order_items: Array<{ product_id: string | null; variant_id: string | null; product_name: string; quantity: number; unit_price: number; line_total: number }>;
};

type VerifyResult = { status: string; order: OrderSummary | null };

const addressText = (a: OrderSummary["shipping_address"]) => [a?.line1, a?.line2, a?.city, a?.state, a?.postalCode].filter(Boolean).join(", ");

/** While a payment is still processing, how often (ms) and how many times to check again before asking the shopper to refresh. */
const RECHECK_EVERY = 8_000;
const RECHECK_TIMES = 10;

/** Confirms the Paystack payment on return and shows the order, emptying the basket once paid. */
export default function StoreOrderResult({ reference }: { reference: string }) {
  const { slug, href, currency } = useStorefront();
  const clearCart = useCartStore((s) => s.clear);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  // Which check this is: 0 on arrival, then one more each time the payment is still processing.
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        fetch(`/api/shop/${encodeURIComponent(slug)}/checkout/verify?reference=${encodeURIComponent(reference)}`)
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (cancelled) return;
            if (!res.ok) throw new Error(data.error || "We couldn't confirm your payment.");
            setResult(data);
            if (data.status === "success") {
              clearCart();
              clearCheckoutToken(slug);
              // The discount code from the basket has been used.
              setBasketCode(slug, null);
              clearCheckoutDetails(slug);
            }
            // Still processing: check again shortly, so the shopper needn't refresh.
            if (data.status === "pending" && attempt < RECHECK_TIMES) setAttempt(attempt + 1);
          })
          .catch((err) => {
            if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
          });
      },
      attempt === 0 ? 0 : RECHECK_EVERY,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, reference, clearCart, attempt]);
  const stillChecking = result?.status === "pending" && attempt < RECHECK_TIMES;

  // Move focus to the outcome so screen-reader users hear it. Repeat checks don't move it again.
  const outcome = error ? "error" : result?.status ?? null;
  useEffect(() => {
    if (outcome) heading.current?.focus();
  }, [outcome]);

  if (!reference) {
    return (
      <div className="cart-empty">
        <h1 className="h-page">We couldn&rsquo;t find that payment</h1>
        <p className="body-copy">The link is missing its payment reference.</p>
        <Link className="btn btn--primary" href={href("/")}>
          Back to the shop
        </Link>
      </div>
    );
  }

  if (error || (result && result.status !== "success")) {
    const pending = result?.status === "pending";
    return (
      <div className="cart-empty">
        <h1 className="h-page" tabIndex={-1} ref={heading}>
          {pending ? "Your payment is still processing" : error ? "We couldn't confirm your payment" : "Your payment wasn't completed"}
        </h1>
        <p className="body-copy">
          {/* Only a confirmed failure means nothing was taken; a checking error doesn't tell us either way. */}
          {pending
            ? stillChecking
              ? "This can take a minute. We're checking again automatically, so you can keep this page open. You won't be charged twice."
              : "This is taking longer than usual. Refresh this page in a few minutes to check again, or look out for our confirmation email. You won't be charged twice."
            : error || "Nothing has been taken from your account. Your basket has been kept so you can try again."}
        </p>
        {stillChecking ? (
          <p className="hint" role="status">
            Checking your payment…
          </p>
        ) : null}
        {pending ? null : error ? (
          <Link className="btn btn--primary" href={href("/")}>
            Back to the shop
          </Link>
        ) : (
          <Link className="btn btn--primary" href={href(STORE_PATHS.checkout)}>
            Try again
          </Link>
        )}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="cart-empty">
        <h1 className="h-page">Confirming your payment…</h1>
        <p className="body-copy" role="status">
          Please keep this page open.
        </p>
      </div>
    );
  }

  const order = result.order;
  return (
    <div className="stack">
      <Icon name="check-circle" size="lg" />
      <h1 className="h-page" tabIndex={-1} ref={heading}>
        Thank you, your order is confirmed
      </h1>
      {order ? (
        <>
          <TrackPurchase orderId={order.id} total={Number(order.total_amount)} lines={purchaseLines(order.order_items)} />
          <p className="body-copy">
            Your order reference is <strong>{order.id.slice(0, 8).toUpperCase()}</strong>. Please keep it in case you need to contact the shop.
          </p>
          <aside className="summary" aria-labelledby="order-summary-title">
            <h2 id="order-summary-title">Your order</h2>
            <ul className="mini-lines">
              {order.order_items.map((item, i) => (
                <li className="mini-line" key={i}>
                  <span>
                    <strong>{item.product_name}</strong>
                    <span className="muted">Qty {item.quantity}</span>
                  </span>
                  <span>{formatShopCurrency(item.line_total, currency)}</span>
                </li>
              ))}
            </ul>
            <dl>
              {Number(order.discount_amount) > 0 ? (
                <>
                  <dt>Discount{order.discount_code ? ` (${order.discount_code})` : ""}</dt>
                  <dd>−{formatShopCurrency(Number(order.discount_amount), currency)}</dd>
                </>
              ) : null}
              {order.delivery_method ? (
                <>
                  <dt>Delivery: {order.delivery_method}</dt>
                  <dd>{Number(order.delivery_fee) > 0 ? formatShopCurrency(Number(order.delivery_fee), currency) : "Free"}</dd>
                </>
              ) : null}
              {Number(order.gift_card_amount) > 0 ? (
                <>
                  <dt>Paid with gift card</dt>
                  <dd>−{formatShopCurrency(Number(order.gift_card_amount), currency)}</dd>
                </>
              ) : null}
              <dt className="total">Total paid</dt>
              <dd className="total">{formatShopCurrency(order.total_amount, currency)}</dd>
            </dl>
            {addressText(order.shipping_address) ? (
              <p className="body-copy">
                <strong>Delivering to:</strong> {addressText(order.shipping_address)}
              </p>
            ) : null}
            <p className="hint">We&rsquo;ve emailed your receipt. The shop will let you know when your order is on its way.</p>
          </aside>
        </>
      ) : null}
      <Link className="btn btn--primary" href={href(STORE_PATHS.products)}>
        Continue shopping
      </Link>
    </div>
  );
}
