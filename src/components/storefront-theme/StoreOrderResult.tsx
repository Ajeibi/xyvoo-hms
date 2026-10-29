"use client";

import { clearCheckoutDetails, setBasketCode } from "@/lib/shop/basket-code";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import { formatShopCurrency } from "@/lib/shop/format";
import { clearCheckoutToken } from "@/lib/store/analytics-client";
import { STORE_PATHS } from "@/lib/store/site/links";
import { useStorefront, useT } from "./StorefrontProvider";
import { Icon } from "./primitives";
import { TrackPurchase } from "./StoreAnalytics";
import OrderUpdatesPush from "./OrderUpdatesPush";
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
  const t = useT();
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
            if (!res.ok) throw new Error(data.error || t("checkout.couldntConfirmPayment"));
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
            if (!cancelled) setError(err instanceof Error ? err.message : t("checkout.somethingWentWrong"));
          });
      },
      attempt === 0 ? 0 : RECHECK_EVERY,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, reference, clearCart, attempt, t]);
  const stillChecking = result?.status === "pending" && attempt < RECHECK_TIMES;

  // Move focus to the outcome so screen-reader users hear it. Repeat checks don't move it again.
  const outcome = error ? "error" : result?.status ?? null;
  useEffect(() => {
    if (outcome) heading.current?.focus();
  }, [outcome]);

  if (!reference) {
    return (
      <div className="cart-empty">
        <h1 className="h-page">{t("checkout.paymentNotFound")}</h1>
        <p className="body-copy">{t("checkout.missingReference")}</p>
        <Link className="btn btn--primary" href={href("/")}>
          {t("checkout.backToShop")}
        </Link>
      </div>
    );
  }

  if (error || (result && result.status !== "success")) {
    const pending = result?.status === "pending";
    return (
      <div className="cart-empty">
        <h1 className="h-page" tabIndex={-1} ref={heading}>
          {pending ? t("checkout.paymentProcessing") : error ? t("checkout.couldntConfirmPaymentTitle") : t("checkout.paymentNotCompleted")}
        </h1>
        <p className="body-copy">
          {/* Only a confirmed failure means nothing was taken; a checking error doesn't tell us either way. */}
          {pending
            ? stillChecking
              ? t("checkout.stillChecking")
              : t("checkout.takingLonger")
            : error || t("checkout.nothingTaken")}
        </p>
        {stillChecking ? (
          <p className="hint" role="status">
            {t("checkout.checkingPayment")}
          </p>
        ) : null}
        {pending ? null : error ? (
          <Link className="btn btn--primary" href={href("/")}>
            {t("checkout.backToShop")}
          </Link>
        ) : (
          <Link className="btn btn--primary" href={href(STORE_PATHS.checkout)}>
            {t("common.tryAgain")}
          </Link>
        )}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="cart-empty">
        <h1 className="h-page">{t("checkout.confirmingPayment")}</h1>
        <p className="body-copy" role="status">
          {t("checkout.keepPageOpen")}
        </p>
      </div>
    );
  }

  const order = result.order;
  return (
    <div className="stack">
      <Icon name="check-circle" size="lg" />
      <h1 className="h-page" tabIndex={-1} ref={heading}>
        {t("checkout.orderConfirmed")}
      </h1>
      {order ? (
        <>
          <TrackPurchase orderId={order.id} total={Number(order.total_amount)} lines={purchaseLines(order.order_items)} />
          <p className="body-copy">
            {t.rich("checkout.orderReferenceShop", { ref: <strong>{order.id.slice(0, 8).toUpperCase()}</strong> })}
          </p>
          <OrderUpdatesPush orderId={order.id} />
          <aside className="summary" aria-labelledby="order-summary-title">
            <h2 id="order-summary-title">{t("checkout.yourOrder")}</h2>
            <ul className="mini-lines">
              {order.order_items.map((item, i) => (
                <li className="mini-line" key={i}>
                  <span>
                    <strong>{item.product_name}</strong>
                    <span className="muted">{t("checkout.qty", { quantity: item.quantity })}</span>
                  </span>
                  <span>{formatShopCurrency(item.line_total, currency)}</span>
                </li>
              ))}
            </ul>
            <dl>
              {Number(order.discount_amount) > 0 ? (
                <>
                  <dt>{order.discount_code ? t("checkout.discountWithCode", { code: order.discount_code }) : t("checkout.discount")}</dt>
                  <dd>−{formatShopCurrency(Number(order.discount_amount), currency)}</dd>
                </>
              ) : null}
              {order.delivery_method ? (
                <>
                  <dt>{t("checkout.deliveryNamed", { method: order.delivery_method })}</dt>
                  <dd>{Number(order.delivery_fee) > 0 ? formatShopCurrency(Number(order.delivery_fee), currency) : t("checkout.free")}</dd>
                </>
              ) : null}
              {Number(order.gift_card_amount) > 0 ? (
                <>
                  <dt>{t("checkout.paidWithGiftCard")}</dt>
                  <dd>−{formatShopCurrency(Number(order.gift_card_amount), currency)}</dd>
                </>
              ) : null}
              <dt className="total">{t("checkout.totalPaid")}</dt>
              <dd className="total">{formatShopCurrency(order.total_amount, currency)}</dd>
            </dl>
            {addressText(order.shipping_address) ? (
              <p className="body-copy">
                <strong>{t("checkout.deliveringTo")}</strong> {addressText(order.shipping_address)}
              </p>
            ) : null}
            <p className="hint">{t("checkout.receiptEmailed")}</p>
          </aside>
        </>
      ) : null}
      <Link className="btn btn--primary" href={href(STORE_PATHS.products)}>
        {t("checkout.continueShopping")}
      </Link>
    </div>
  );
}
