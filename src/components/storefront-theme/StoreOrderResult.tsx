"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import { formatShopCurrency } from "@/lib/shop/format";
import { clearCheckoutToken } from "@/lib/store/analytics-client";
import { STORE_PATHS } from "@/lib/store/site/links";
import { useStorefront } from "./StorefrontProvider";
import { Icon } from "./primitives";

type OrderSummary = {
  id: string;
  reference: string;
  customer_name: string;
  customer_email: string | null;
  total_amount: number;
  delivery_method: string | null;
  delivery_fee: number | null;
  discount_code: string | null;
  discount_amount: number | null;
  gift_card_amount: number | null;
  tax_amount: number;
  tax_inclusive: boolean;
  shipping_address: { line1?: string; line2?: string; city?: string; state?: string; postcode?: string } | null;
  order_items: Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>;
};

type VerifyResult = { status: string; order: OrderSummary | null };

/**
 * Seconds to wait between automatic checks while the payment is still
 * processing: about a minute and a half in all, a little over ten checks, well
 * inside the checker's limit of 30 every 10 minutes.
 */
const RECHECK_DELAYS = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25];

/** Confirms the Paystack payment on return and shows the order, emptying the basket once paid. */
export default function StoreOrderResult({ reference }: { reference: string }) {
  const { slug, href, currency } = useStorefront();
  const clearCart = useCartStore((s) => s.clear);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  // Still processing after every automatic check: the shopper can check again themselves.
  const [gaveUp, setGaveUp] = useState(false);
  const [checking, setChecking] = useState(false);
  // Bumped by "Check again" to start a fresh round of checks.
  const [round, setRound] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  // Checks the payment, then again after each delay while it's still processing.
  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    let timer: number | undefined;
    let attempt = 0;
    const check = async () => {
      try {
        const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/checkout/verify?reference=${encodeURIComponent(reference)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "We couldn't confirm your payment.");
        setResult(data);
        setError("");
        if (data.status === "success") {
          clearCart();
          clearCheckoutToken(slug);
        } else if (data.status === "pending") {
          const delay = RECHECK_DELAYS[attempt];
          attempt += 1;
          if (delay === undefined) setGaveUp(true);
          else timer = window.setTimeout(() => void check(), delay * 1000);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    // Next tick, so React's development double-run cancels the first before it calls the server.
    timer = window.setTimeout(() => void check(), 0);
    // Stop checking if the shopper leaves the page.
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, reference, clearCart, round]);

  const outcome = error ? "error" : result?.status ?? "loading";
  // Move focus to the heading when the outcome changes, so screen-reader users hear it.
  useEffect(() => {
    if (outcome !== "loading") heading.current?.focus();
  }, [outcome]);

  const checkAgain = () => {
    setChecking(true);
    setGaveUp(false);
    setError("");
    setRound((n) => n + 1);
  };

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

  if (outcome === "pending") {
    return (
      <div className="cart-empty">
        <h1 className="h-page" tabIndex={-1} ref={heading}>
          Your payment is still processing
        </h1>
        <p className="body-copy" role="status">
          {gaveUp
            ? "This is taking longer than usual. Check again in a minute or two. You won't be charged twice, and your basket has been kept."
            : "This usually takes less than a minute. We're checking for you, so you don't need to refresh. You won't be charged twice."}
        </p>
        {gaveUp ? (
          <button type="button" className="btn btn--primary" onClick={checkAgain} disabled={checking}>
            {checking ? "Checking…" : "Check again"}
          </button>
        ) : (
          <p className="checking" aria-hidden="true">
            Checking…
          </p>
        )}
      </div>
    );
  }

  if (outcome === "error" || (result && result.status !== "success")) {
    return (
      <div className="cart-empty">
        <h1 className="h-page" tabIndex={-1} ref={heading}>
          {error ? "We couldn't confirm your payment" : "Your payment wasn't completed"}
        </h1>
        <p className="body-copy">
          {/* Only a confirmed failure means nothing was taken; a checking error doesn't tell us either way. */}
          {error || "Nothing has been taken from your account. Your basket has been kept so you can try again."}
        </p>
        {error ? (
          <div className="order-confirmed__actions">
            <button type="button" className="btn btn--primary" onClick={checkAgain} disabled={checking}>
              {checking ? "Checking…" : "Check again"}
            </button>
            <Link className="btn btn--outline" href={href("/")}>
              Back to the shop
            </Link>
          </div>
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
  const money = (amount: number) => formatShopCurrency(amount, currency);
  const itemsTotal = order ? order.order_items.reduce((sum, item) => sum + Number(item.line_total), 0) : 0;
  const deliveryFee = Number(order?.delivery_fee) || 0;
  const discount = Number(order?.discount_amount) || 0;
  const giftCard = Number(order?.gift_card_amount) || 0;
  const address = order?.shipping_address?.line1
    ? [order.shipping_address.line1, order.shipping_address.line2, order.shipping_address.city, order.shipping_address.state, order.shipping_address.postcode].filter(Boolean)
    : null;

  return (
    <div className="stack order-confirmed">
      <Icon name="check-circle" size="lg" />
      <h1 className="h-page" tabIndex={-1} ref={heading}>
        Thank you, your order is confirmed
      </h1>
      {order ? (
        <>
          <p className="body-copy">
            Your order reference is <strong>{order.reference}</strong>.
            {order.customer_email ? (
              <>
                {" "}
                We&rsquo;ve emailed a receipt to <strong>{order.customer_email}</strong>.
              </>
            ) : null}{" "}
            Keep the reference in case you need to contact the shop.
          </p>

          {order.delivery_method || address ? (
            <section className="summary" aria-labelledby="order-delivery-title">
              <h2 id="order-delivery-title">{address ? "Delivery" : "Collection"}</h2>
              {order.delivery_method ? (
                <p className="order-confirmed__method">
                  <Icon name="truck" size="sm" /> {order.delivery_method}
                </p>
              ) : null}
              {address ? (
                <address className="order-confirmed__address">
                  {address.map((line, i) => (
                    <span key={i}>{line}</span>
                  ))}
                </address>
              ) : null}
            </section>
          ) : null}

          <aside className="summary" aria-labelledby="order-summary-title">
            <h2 id="order-summary-title">Your order</h2>
            <ul className="mini-lines">
              {order.order_items.map((item, i) => (
                <li className="mini-line" key={i}>
                  <span>
                    <strong>{item.product_name}</strong>
                    <span className="muted">Qty {item.quantity}</span>
                  </span>
                  <span>{money(Number(item.line_total))}</span>
                </li>
              ))}
            </ul>
            <dl>
              <dt>Items</dt>
              <dd>{money(itemsTotal)}</dd>
              {discount > 0 ? (
                <>
                  <dt>Discount{order.discount_code ? ` (${order.discount_code})` : ""}</dt>
                  <dd>−{money(discount)}</dd>
                </>
              ) : null}
              {order.delivery_method ? (
                <>
                  <dt>{address ? "Delivery" : "Collection"}</dt>
                  <dd>{deliveryFee > 0 ? money(deliveryFee) : "Free"}</dd>
                </>
              ) : null}
              {order.tax_amount > 0 && !order.tax_inclusive ? (
                <>
                  <dt>Tax</dt>
                  <dd>{money(order.tax_amount)}</dd>
                </>
              ) : null}
              {giftCard > 0 ? (
                <>
                  <dt>Gift card</dt>
                  <dd>−{money(giftCard)}</dd>
                </>
              ) : null}
              <dt className="total">Total paid</dt>
              <dd className="total">{money(Number(order.total_amount))}</dd>
            </dl>
            {order.tax_amount > 0 && order.tax_inclusive ? <p className="tax-note">Includes tax of {money(order.tax_amount)}</p> : null}
          </aside>
        </>
      ) : null}
      <div className="order-confirmed__actions">
        <Link className="btn btn--primary" href={href(STORE_PATHS.products)}>
          Continue shopping
        </Link>
        <Link className="btn btn--outline" href={href("/account")}>
          See your orders
        </Link>
      </div>
    </div>
  );
}
