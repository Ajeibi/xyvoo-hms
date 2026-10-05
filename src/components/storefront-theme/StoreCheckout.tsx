"use client";

import { useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import { calculateCartTotals, cartLineKey } from "@/lib/shop/cart";
import { formatShopCurrency } from "@/lib/shop/format";
import { STORE_PATHS } from "@/lib/store/site/links";
import { deliveryFeeFor } from "@/lib/store/delivery";
import { useStorefront } from "./StorefrontProvider";
import { Icon, StoreImage } from "./primitives";

type FieldName = "name" | "email" | "phone" | "line1" | "line2" | "city" | "state" | "terms";
type Errors = Partial<Record<FieldName, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CheckoutDeliveryOption = { id: string; name: string; fee: number; freeOver: number | null; etaText: string | null; isPickup: boolean };

function validate(form: FormData, needsTerms: boolean, needsAddress: boolean): Errors {
  const value = (name: FieldName) => String(form.get(name) ?? "").trim();
  const errors: Errors = {};
  if (!value("email")) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(value("email"))) errors.email = "Enter an email address in the format name@example.com.";
  if (value("phone").replace(/\D/g, "").length < 7) errors.phone = "Enter a phone number so the shop can reach you about your order.";
  if (!value("name")) errors.name = "Enter your full name.";
  if (needsAddress) {
    if (!value("line1")) errors.line1 = "Enter the first line of your address.";
    if (!value("city")) errors.city = "Enter your town or city.";
    if (!value("state")) errors.state = "Enter your state.";
  }
  if (needsTerms && !form.get("terms")) errors.terms = "Please confirm you agree to the terms of sale.";
  return errors;
}

const FIELD_ORDER: FieldName[] = ["email", "phone", "name", "line1", "line2", "city", "state", "terms"];

export default function StoreCheckout({
  countryCode,
  termsHref,
  privacyHref,
  deliveryOptions,
}: {
  countryCode: string;
  termsHref: string | null;
  privacyHref: string | null;
  deliveryOptions: CheckoutDeliveryOption[];
}) {
  const { slug, href } = useStorefront();
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [zoneId, setZoneId] = useState(deliveryOptions[0]?.id ?? null);
  const { subtotal, currency } = calculateCartTotals(lines);
  const zone = deliveryOptions.find((o) => o.id === zoneId) ?? null;
  // Shown for the shopper's information; the server works the charge out again.
  const deliveryFee = zone ? deliveryFeeFor(zone, subtotal) : 0;
  const total = subtotal + deliveryFee;
  const needsAddress = !zone?.isPickup;
  const optionPrice = (o: CheckoutDeliveryOption) => {
    const fee = deliveryFeeFor(o, subtotal);
    return fee === 0 ? "Free" : formatShopCurrency(fee, currency);
  };

  const field = (name: FieldName) => ({
    id: `co-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `co-${name}-error` : undefined,
    // Re-check a field the shopper is correcting as soon as they leave it.
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      const form = e.currentTarget.form;
      if (!errors[name] || !form) return;
      const next = validate(new FormData(form), Boolean(termsHref), needsAddress);
      setErrors((prev) => ({ ...prev, [name]: next[name] }));
    },
  });
  const errorFor = (name: FieldName) =>
    errors[name] ? (
      <p className="error-msg" id={`co-${name}-error`}>
        {errors[name]}
      </p>
    ) : null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const found = validate(form, Boolean(termsHref), needsAddress);
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((f) => found[f]);
    if (firstInvalid) {
      setStatus("Please correct the highlighted fields.");
      document.getElementById(`co-${firstInvalid}`)?.focus();
      return;
    }

    setSubmitting(true);
    setStatus("Taking you to secure payment…");
    const get = (name: FieldName) => String(form.get(name) ?? "").trim() || undefined;

    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: get("name"), email: get("email"), phone: get("phone") },
          shippingAddress: needsAddress
            ? { line1: get("line1"), line2: get("line2"), city: get("city"), state: get("state"), country: countryCode }
            : { country: countryCode },
          items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
          deliveryZoneId: zone?.id ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authorizationUrl) {
        setStatus(typeof data.error === "string" ? data.error : "We couldn't start your payment. Please try again.");
        setSubmitting(false);
        return;
      }
      // The basket is kept until payment is confirmed, so an abandoned payment can be retried.
      window.location.assign(data.authorizationUrl);
    } catch {
      setStatus("We couldn't connect. Check your internet connection and try again.");
      setSubmitting(false);
    }
  };

  if (!hasHydrated) {
    return (
      <p className="body-copy" role="status">
        Loading your basket…
      </p>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="cart-empty">
        <Icon name="bag" />
        <h2 className="h-section">Your basket is empty</h2>
        <p className="body-copy">Add something to your basket before checking out.</p>
        <Link className="btn btn--primary" href={href(STORE_PATHS.products)}>
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="checkout-layout">
      <form className="contact-form" onSubmit={submit} noValidate aria-label="Checkout">
        <p className="body-copy">All fields are required unless marked optional.</p>

        <section className="checkout-step" aria-labelledby="step-contact">
          <h2 className="step-title" id="step-contact">
            <span className="step-num" aria-hidden="true">
              1
            </span>
            Contact details
          </h2>
          <div className="field">
            <label htmlFor="co-name">Full name</label>
            <input className="input" type="text" autoComplete="name" {...field("name")} />
            {errorFor("name")}
          </div>
          <div className="field">
            <label htmlFor="co-email">Email address</label>
            <input className="input" type="email" autoComplete="email" inputMode="email" {...field("email")} />
            <p className="hint">So the shop can contact you about your order.</p>
            {errorFor("email")}
          </div>
          <div className="field">
            <label htmlFor="co-phone">Phone number</label>
            <input className="input" type="tel" autoComplete="tel" inputMode="tel" {...field("phone")} />
            <p className="hint">Only used for your order.</p>
            {errorFor("phone")}
          </div>
        </section>

        {deliveryOptions.length ? (
          <section className="checkout-step" aria-labelledby="step-delivery">
            <h2 className="step-title" id="step-delivery">
              <span className="step-num" aria-hidden="true">
                2
              </span>
              Delivery method
            </h2>
            <fieldset>
              <legend className="visually-hidden">Choose a delivery method</legend>
              <div className="radio-cards">
                {deliveryOptions.map((o) => (
                  <label className="radio-card" key={o.id}>
                    <input type="radio" name="delivery" value={o.id} checked={zoneId === o.id} onChange={() => setZoneId(o.id)} />
                    <span>
                      <strong>{o.name}</strong>
                      {o.etaText || o.isPickup ? <small>{o.isPickup ? o.etaText || "Collect from the shop" : o.etaText}</small> : null}
                    </span>
                    <span>{optionPrice(o)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
        ) : null}

        {needsAddress ? (
        <section className="checkout-step" aria-labelledby="step-address">
          <h2 className="step-title" id="step-address">
            <span className="step-num" aria-hidden="true">
              {deliveryOptions.length ? 3 : 2}
            </span>
            Delivery address
          </h2>
          <div className="field">
            <label htmlFor="co-line1">Address line 1</label>
            <input className="input" type="text" autoComplete="address-line1" {...field("line1")} />
            {errorFor("line1")}
          </div>
          <div className="field">
            <label htmlFor="co-line2">
              Address line 2 <span className="optional">(optional)</span>
            </label>
            <input className="input" type="text" autoComplete="address-line2" {...field("line2")} />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="co-city">Town or city</label>
              <input className="input" type="text" autoComplete="address-level2" {...field("city")} />
              {errorFor("city")}
            </div>
            <div className="field">
              <label htmlFor="co-state">State</label>
              <input className="input" type="text" autoComplete="address-level1" {...field("state")} />
              {errorFor("state")}
            </div>
          </div>
        </section>
        ) : null}

        <section className="checkout-step" aria-labelledby="step-payment">
          <h2 className="step-title" id="step-payment">
            <span className="step-num" aria-hidden="true">
              {2 + (deliveryOptions.length ? 1 : 0) + (needsAddress ? 1 : 0)}
            </span>
            Payment
          </h2>
          <div className="payment-box">
            <p>
              <strong>Secure payment with Paystack</strong>
            </p>
            <p>You&rsquo;ll pay on Paystack&rsquo;s secure page. Your card details go straight to Paystack and never pass through this shop.</p>
          </div>
          {termsHref ? (
            <>
              <label className="check check--top">
                <input type="checkbox" value="yes" {...field("terms")} />
                <span>
                  I agree to the <Link href={termsHref}>terms of sale</Link>
                  {privacyHref ? (
                    <>
                      {" "}
                      and have read the <Link href={privacyHref}>privacy policy</Link>
                    </>
                  ) : null}
                  .
                </span>
              </label>
              {errorFor("terms")}
            </>
          ) : null}
          <button className="btn btn--primary" type="submit" disabled={submitting}>
            <Icon name="lock" size="sm" />
            {submitting ? "Please wait…" : `Pay ${formatShopCurrency(total, currency)}`}
          </button>
          <p className="form-status" role="status">
            {status}
          </p>
        </section>
      </form>

      <aside className="summary" aria-labelledby="co-summary-title">
        <h2 id="co-summary-title">Your order</h2>
        <ul className="mini-lines">
          {lines.map((line) => (
            <li className="mini-line" key={cartLineKey(line.productId, line.variantId)}>
              <span className="media tone-6" aria-hidden="true">
                {line.imageUrl ? <StoreImage src={line.imageUrl} alt="" sizes="64px" /> : null}
                <span className="mini-line__qty">{line.quantity}</span>
              </span>
              <span>
                <strong>{line.name}</strong>
                <span className="muted">
                  {line.variantLabel ? `${line.variantLabel} · ` : ""}Qty {line.quantity}
                </span>
              </span>
              <span>{formatShopCurrency(line.unitPrice * line.quantity, line.currency)}</span>
            </li>
          ))}
        </ul>
        <dl>
          {zone ? (
            <>
              <dt>Subtotal</dt>
              <dd>{formatShopCurrency(subtotal, currency)}</dd>
              <dt>{zone.isPickup ? "Collection" : "Delivery"}</dt>
              <dd>{deliveryFee === 0 ? "Free" : formatShopCurrency(deliveryFee, currency)}</dd>
            </>
          ) : null}
          <dt className="total">Total</dt>
          <dd className="total">{formatShopCurrency(total, currency)}</dd>
        </dl>
        <Link className="link-arrow" href={href(STORE_PATHS.cart)}>
          Edit basket
        </Link>
      </aside>
    </div>
  );
}
