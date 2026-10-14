"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ShopProduct } from "@/lib/shop/products";
import type { CheckoutPaymentMethod } from "@/lib/store/offline-payments";
import { useMoney } from "./StorefrontProvider";
import { useStorefront } from "./StorefrontProvider";
import { useShopAccount } from "./useShopAccount";

const PAY_LABELS: Record<CheckoutPaymentMethod, string> = {
  card: "Pay online now (card or bank transfer)",
  bank_transfer: "Bank transfer (the card is sent once the shop receives your payment)",
  pay_on_delivery: "Pay on delivery",
  whatsapp: "Arrange payment on WhatsApp",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The gift card's own page: choose an amount, say who it's for and add a
 * message, then pay. It doesn't go in the basket; the card is emailed to them
 * as soon as the payment is confirmed.
 */
export default function GiftCardBuy({ product, storeName, paymentMethods }: { product: ShopProduct; storeName: string; paymentMethods: CheckoutPaymentMethod[] }) {
  const { slug } = useStorefront();
  const money = useMoney();
  const { account } = useShopAccount();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // Not pay on delivery: there's nothing to deliver.
  const methods = paymentMethods.filter((m) => m !== "pay_on_delivery");
  const amounts = product.variants
    .filter((v) => v.priceOverride != null)
    .map((v) => ({ id: v.id, amount: Number(v.priceOverride) }))
    .sort((a, b) => a.amount - b.amount);
  const [variantId, setVariantId] = useState(amounts[1]?.id ?? amounts[0]?.id ?? null);
  const [method, setMethod] = useState<CheckoutPaymentMethod | null>(methods[0] ?? null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [token] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : String(Date.now())));
  const chosen = amounts.find((a) => a.id === variantId) ?? null;

  // A signed-in shopper's own details are filled in as the buyer.
  useEffect(() => {
    const form = formRef.current;
    if (!account || !form) return;
    const fill = (name: string, value: string | null) => {
      const input = form.elements.namedItem(name);
      if (value && input instanceof HTMLInputElement && !input.value) input.value = value;
    };
    fill("buyerName", account.name);
    fill("buyerEmail", account.email);
  }, [account]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (n: string) => String(form.get(n) ?? "").trim();
    const problem = !chosen
      ? "Choose an amount."
      : !get("recipientName")
        ? "Enter who the gift card is for."
        : !EMAIL.test(get("recipientEmail"))
          ? "Enter the email address to send the gift card to."
          : !get("buyerName")
            ? "Enter your name."
            : !EMAIL.test(get("buyerEmail"))
              ? "Enter your email address, for your receipt."
              : !method
                ? "This shop isn't taking payments online at the moment."
                : "";
    if (problem) return setStatus(problem);

    setSending(true);
    setStatus(method === "card" ? "Taking you to secure payment…" : "Placing your order…");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: get("buyerName"), email: get("buyerEmail") },
          items: [{ productId: product.id, variantId: chosen!.id, quantity: 1 }],
          paymentMethod: method,
          checkoutToken: token,
          giftCard: {
            recipientName: get("recipientName"),
            recipientEmail: get("recipientEmail"),
            senderName: get("buyerName"),
            message: get("message") || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      const next = typeof data.authorizationUrl === "string" ? data.authorizationUrl : typeof data.receivedUrl === "string" ? data.receivedUrl : null;
      if (!res.ok || !next) {
        setStatus(typeof data.error === "string" ? data.error : "We couldn't place your order. Please try again.");
        setSending(false);
        return;
      }
      window.location.assign(next);
    } catch {
      setStatus("We couldn't connect. Check your internet connection and try again.");
      setSending(false);
    }
  };

  return (
    <div className="giftcard">
      <div className="giftcard__preview" aria-hidden="true">
        <span className="giftcard__shop">{storeName}</span>
        <span className="giftcard__amount">{chosen ? money.format(money.convert(chosen.amount)) : "Gift card"}</span>
        <span className="giftcard__label">Gift card</span>
      </div>

      <form ref={formRef} className="giftcard__form account-form" onSubmit={submit} noValidate aria-label="Buy a gift card">
        <h1 className="h-page">Gift card</h1>
        <p className="lead">
          The perfect present: they choose what they love. We email the gift card straight to them, and they can spend it in one go or over several orders.
        </p>

        <fieldset className="option-group">
          <legend>
            Amount: <span>{chosen ? money.format(money.convert(chosen.amount)) : "choose one"}</span>
          </legend>
          <div className="pills">
            {amounts.map((a) => (
              <label className="pill" key={a.id}>
                <input type="radio" name="amount" value={a.id} checked={variantId === a.id} onChange={() => setVariantId(a.id)} />
                <span>{money.format(money.convert(a.amount))}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="giftcard__group">
          <legend>Who is it for?</legend>
          <div className="field">
            <label htmlFor={`${id}-rname`}>Their name</label>
            <input className="input" id={`${id}-rname`} name="recipientName" autoComplete="off" maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-remail`}>Their email address</label>
            <input className="input" id={`${id}-remail`} name="recipientEmail" type="email" inputMode="email" autoComplete="off" maxLength={200} />
            <p className="hint">We&rsquo;ll send the gift card here as soon as your payment is confirmed.</p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-message`}>
              Your message <span className="optional">(optional)</span>
            </label>
            <textarea className="input" id={`${id}-message`} name="message" rows={3} maxLength={300} />
          </div>
        </fieldset>

        <fieldset className="giftcard__group">
          <legend>About you</legend>
          <div className="field">
            <label htmlFor={`${id}-bname`}>Your name</label>
            <input className="input" id={`${id}-bname`} name="buyerName" autoComplete="name" maxLength={120} />
            <p className="hint">Shown on the gift card email, so they know it&rsquo;s from you.</p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-bemail`}>Your email address</label>
            <input className="input" id={`${id}-bemail`} name="buyerEmail" type="email" inputMode="email" autoComplete="email" maxLength={200} />
            <p className="hint">For your receipt.</p>
          </div>
        </fieldset>

        {methods.length > 1 ? (
          <fieldset className="giftcard__group">
            <legend>How would you like to pay?</legend>
            {methods.map((m) => (
              <label className="check check--top" key={m}>
                <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                <span>{PAY_LABELS[m]}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <button className="btn btn--primary" type="submit" disabled={sending || !methods.length}>
          {sending ? "Please wait…" : chosen ? `Buy a ${money.format(money.convert(chosen.amount))} gift card` : "Buy a gift card"}
        </button>
        {!methods.length ? <p className="hint">This shop isn&rsquo;t taking payments online at the moment.</p> : null}
        <p className="form-status" role="status">
          {status}
        </p>
      </form>
    </div>
  );
}
