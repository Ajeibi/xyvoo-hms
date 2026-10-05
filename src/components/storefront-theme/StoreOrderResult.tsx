"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import { formatShopCurrency } from "@/lib/shop/format";
import { STORE_PATHS } from "@/lib/store/site/links";
import { useStorefront } from "./StorefrontProvider";
import { Icon } from "./primitives";

type OrderSummary = {
  id: string;
  customer_name: string;
  total_amount: number;
  order_items: Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>;
};

type VerifyResult = { status: string; order: OrderSummary | null };

/** Confirms the Paystack payment on return and shows the order, emptying the basket once paid. */
export default function StoreOrderResult({ reference }: { reference: string }) {
  const { slug, href, currency } = useStorefront();
  const clearCart = useCartStore((s) => s.clear);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const called = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!reference || called.current) return;
    called.current = true;
    fetch(`/api/shop/${encodeURIComponent(slug)}/checkout/verify?reference=${encodeURIComponent(reference)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "We couldn't confirm your payment.");
        setResult(data);
        if (data.status === "success") clearCart();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."));
  }, [slug, reference, clearCart]);

  // Move focus to the outcome so screen-reader users hear it.
  useEffect(() => {
    if (result || error) heading.current?.focus();
  }, [result, error]);

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
          {pending ? "Your payment is still processing" : "Your payment wasn't completed"}
        </h1>
        <p className="body-copy">
          {pending
            ? "This can take a minute. Refresh this page shortly to check again. You won't be charged twice."
            : error || "Nothing has been taken from your account. Your basket has been kept so you can try again."}
        </p>
        {!pending ? (
          <Link className="btn btn--primary" href={href(STORE_PATHS.checkout)}>
            Try again
          </Link>
        ) : null}
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
              <dt className="total">Total paid</dt>
              <dd className="total">{formatShopCurrency(order.total_amount, currency)}</dd>
            </dl>
          </aside>
        </>
      ) : null}
      <Link className="btn btn--primary" href={href(STORE_PATHS.products)}>
        Continue shopping
      </Link>
    </div>
  );
}
