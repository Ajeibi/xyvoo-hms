"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import { analyticsSessionId, checkoutToken, track } from "@/lib/store/analytics-client";
import type { CheckoutPaymentMethod } from "@/lib/store/offline-payments";
import { calculateCartTotals, cartLineKey } from "@/lib/shop/cart";
import { STORE_PATHS } from "@/lib/store/site/links";
import { deliveryWithRules, type CheckoutFreeRule } from "@/lib/store/free-delivery";
import { fitsWeight, orderWeightKg, zoneCovers, type WeightBand } from "@/lib/store/delivery";
import { COUNTRY_REGIONS, regionLabel } from "@/lib/store/regions";
import { allocateDiscount, computeTax, taxLabel, type TaxSettings } from "@/lib/store/tax";
import { decodeStoredReferral, referralStorageKey } from "@/lib/store/referral-link";
import { pointsValue, redeemablePoints, type LoyaltySettings } from "@/lib/store/loyalty";
import { useMoney, useStorefront } from "./StorefrontProvider";
import ChargeNote from "./ChargeNote";
import { useBasketPrices } from "./useBasketPrices";
import { useShopAccount } from "./useShopAccount";
import { Icon, StoreImage } from "./primitives";

type FieldName = "name" | "email" | "phone" | "line1" | "line2" | "city" | "state" | "terms";
type Errors = Partial<Record<FieldName, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CheckoutDeliveryOption = {
  id: string;
  name: string;
  fee: number;
  freeOver: number | null;
  etaText: string | null;
  isPickup: boolean;
  /** States and towns it delivers to; empty means everywhere. Checked again on the server. */
  regions: string[];
  /** Charges by the order's weight when there are any bands. */
  weightBands: WeightBand[];
};

/** The shop's tax settings, for showing tax in the summary (the server works it out again). */
export type CheckoutTax = Pick<TaxSettings, "enabled" | "name" | "rate" | "inclusive" | "onDelivery">;

function validate(form: FormData, needsTerms: boolean, needsAddress: boolean, stateLabel = "state"): Errors {
  const value = (name: FieldName) => String(form.get(name) ?? "").trim();
  const errors: Errors = {};
  if (!value("email")) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(value("email"))) errors.email = "Enter an email address in the format name@example.com.";
  if (value("phone").replace(/\D/g, "").length < 7) errors.phone = "Enter a phone number so the shop can reach you about your order.";
  if (!value("name")) errors.name = "Enter your full name.";
  if (needsAddress) {
    if (!value("line1")) errors.line1 = "Enter the first line of your address.";
    if (!value("city")) errors.city = "Enter your town or city.";
    if (!value("state")) errors.state = `Choose your ${stateLabel}.`;
  }
  if (needsTerms && !form.get("terms")) errors.terms = "Please confirm you agree to the terms of sale.";
  return errors;
}

const PAYMENT_COPY: Record<CheckoutPaymentMethod, { title: string; text: string }> = {
  card: { title: "Pay online now", text: "By card or bank transfer on Paystack's secure page. Your card details never pass through this shop." },
  bank_transfer: { title: "Bank transfer", text: "We'll show the shop's account details after you order. The shop confirms your order once your payment arrives." },
  pay_on_delivery: { title: "Pay on delivery", text: "Pay when your order arrives." },
  whatsapp: { title: "Order on WhatsApp", text: "Send your order to the shop on WhatsApp and agree payment with them there." },
};

const FIELD_ORDER: FieldName[] = ["email", "phone", "name", "line1", "line2", "city", "state", "terms"];

export default function StoreCheckout({
  countryCode,
  storeName,
  termsHref,
  privacyHref,
  deliveryOptions,
  freeRules,
  tax,
  paymentMethods,
}: {
  countryCode: string;
  storeName: string;
  termsHref: string | null;
  privacyHref: string | null;
  deliveryOptions: CheckoutDeliveryOption[];
  /** The shop's free delivery rules; checked again on the server. */
  freeRules: CheckoutFreeRule[];
  tax: CheckoutTax;
  paymentMethods: CheckoutPaymentMethod[];
}) {
  const { slug, href } = useStorefront();
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [zoneId, setZoneId] = useState(deliveryOptions[0]?.id ?? null);
  const [method, setMethod] = useState<CheckoutPaymentMethod>(paymentMethods[0] ?? "card");
  const money = useMoney();
  // A discount code the shopper applied, checked by the shop's server. Cleared if the basket changes.
  const [discount, setDiscount] = useState<{ code: string; amount: number; freeDelivery: boolean; appliesTo: string[] | null; description: string; basket: string } | null>(
    null,
  );
  const [codeInput, setCodeInput] = useState("");
  // A gift card pays as much of the total as its balance covers; the server works it out again.
  const [giftCard, setGiftCard] = useState<{ code: string; balance: number } | null>(null);
  const [giftInput, setGiftInput] = useState("");
  // Loyalty points a confirmed shopper can use; the server works it out again.
  const { loyalty } = useShopAccount();
  const [usePoints, setUsePoints] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [checkingGift, setCheckingGift] = useState(false);
  const [codeMessage, setCodeMessage] = useState("");
  const [applyingCode, setApplyingCode] = useState(false);
  const basketKey = lines.map((l) => `${cartLineKey(l.productId, l.variantId)}x${l.quantity}`).join(",");
  const activeDiscount = discount && discount.basket === basketKey ? discount : null;
  const discountAmount = activeDiscount?.amount ?? 0;
  // Fees and the charge are worked out in the home currency (the server works
  // them out again); the shopper sees them in their chosen currency.
  const { subtotal: itemsSubtotal } = calculateCartTotals(lines);
  const subtotal = Math.max(itemsSubtotal - discountAmount, 0);
  const freeDeliveryCode = Boolean(activeDiscount?.freeDelivery);

  // Today's prices, tax rates and weights from the shop: a sale may have started or ended since the basket was filled.
  const { taxRates, weights, pricesChanged, trade } = useBasketPrices(slug);
  const weighedLines = lines.map((l) => ({ ...l, weightKg: weights[cartLineKey(l.productId, l.variantId)] ?? 0 }));
  const basketKg = orderWeightKg(weighedLines);

  // Where the shopper is: which delivery options cover them, and free delivery rules that depend on it.
  const [address, setAddress] = useState({ state: "", city: "" });
  const addressKnown = Boolean(address.state.trim() || address.city.trim());
  // Options limited to some areas appear once the shopper's state or town is known and covered.
  const offeredByArea = deliveryOptions.filter((o) => o.isPickup || o.regions.length === 0 || (addressKnown && zoneCovers(o, address)));
  // An option that charges by weight is only offered if the basket is within its heaviest band.
  const offered = offeredByArea.filter((o) => fitsWeight(o, basketKg));
  const tooHeavy = offeredByArea.length > 0 && offered.length === 0;
  const waitingForAddress = !addressKnown && offered.length < deliveryOptions.length;
  const zone = offered.find((o) => o.id === zoneId) ?? offered[0] ?? null;
  const noDeliveryHere = deliveryOptions.length > 0 && offered.length === 0 && !tooHeavy;
  const deliveryFor = (o: CheckoutDeliveryOption) =>
    freeDeliveryCode ? { fee: 0, rule: null } : deliveryWithRules(o, { ...address, subtotal, lines: weighedLines }, freeRules);
  const delivery = zone ? deliveryFor(zone) : { fee: 0, rule: null };
  const deliveryFee = delivery.fee;

  // Tax, line by line after the discount (worked out again on the server).
  const settings: TaxSettings = { ...tax, number: null };
  const lineTotals = lines.map((l) => ({ productId: l.productId, lineTotal: l.unitPrice * l.quantity }));
  const shares = allocateDiscount(lineTotals, activeDiscount?.appliesTo ?? null, discountAmount);
  const taxResult = computeTax(
    settings,
    lines.map((l, i) => ({ lineTotal: lineTotals[i].lineTotal, discount: shares[i], rate: taxRates[cartLineKey(l.productId, l.variantId)] ?? tax.rate })),
    deliveryFee,
  );
  const addedTax = taxResult.inclusive ? 0 : taxResult.amount;
  const total = subtotal + deliveryFee + addedTax;
  const shownSubtotal = money.subtotal(lines);
  const shownDiscount = money.convert(discountAmount);
  const shownDeliveryFee = money.convert(deliveryFee);
  const shownTax = money.convert(taxResult.amount);
  const shownTotal = Math.max(shownSubtotal - shownDiscount, 0) + shownDeliveryFee + (taxResult.inclusive ? 0 : shownTax);
  const giftUsed = giftCard ? Math.min(giftCard.balance, Math.max(total, 0)) : 0;
  const shownGift = money.convert(giftUsed);
  const pointSettings: LoyaltySettings | null = loyalty ? { enabled: true, pointsPer100: loyalty.pointsPer100, pointValue: loyalty.pointValue, minRedeem: loyalty.minRedeem, expiryMonths: 0 } : null;
  const availablePoints = pointSettings && loyalty ? redeemablePoints(pointSettings, loyalty.balance, Math.max(total - giftUsed, 0)) : 0;
  const pointsToUse = usePoints ? availablePoints : 0;
  const pointsOff = pointSettings ? pointsValue(pointSettings, pointsToUse) : 0;
  const shownPointsOff = money.convert(pointsOff);
  const shownToPay = Math.max(shownTotal - shownGift - shownPointsOff, 0);
  const stateRegions = COUNTRY_REGIONS[countryCode]?.regions ?? null;
  const stateLabel = regionLabel(countryCode);

  const applyGiftCard = async () => {
    const typed = giftInput.trim();
    if (!typed) return setGiftMessage("Enter your gift card code.");
    setCheckingGift(true);
    setGiftMessage("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/gift-cards/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGiftMessage(typeof data.error === "string" ? data.error : "We couldn't check that gift card. Please try again.");
        return;
      }
      setGiftCard({ code: data.code, balance: Number(data.balance) || 0 });
      setGiftInput("");
      setGiftMessage(`Gift card added. It has ${money.format(money.convert(Number(data.balance) || 0))} on it.`);
    } catch {
      setGiftMessage("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setCheckingGift(false);
    }
  };

  const applyCode = async (code?: string) => {
    const typed = (code ?? codeInput).trim();
    if (!typed) {
      setCodeMessage("Enter a discount code.");
      return;
    }
    setApplyingCode(true);
    setCodeMessage("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: typed, items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDiscount(null);
        if (code) forgetReferral();
        setCodeMessage(typeof data.error === "string" ? data.error : "We couldn't check that code. Please try again.");
        return;
      }
      setDiscount({
        code: data.code,
        amount: Number(data.amount) || 0,
        freeDelivery: Boolean(data.freeDelivery),
        appliesTo: Array.isArray(data.appliesTo) ? data.appliesTo : null,
        description: data.description,
        basket: basketKey,
      });
      setCodeInput("");
      setCodeMessage(`Code ${data.code} applied: ${data.description}.`);
    } catch {
      setCodeMessage("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setApplyingCode(false);
    }
  };
  // A friend's link left its code in the browser: apply it once, so the friend doesn't have to type it.
  const referralTried = useRef(false);
  const forgetReferral = () => {
    try {
      localStorage.removeItem(referralStorageKey(slug));
    } catch {
      // Nothing stored, nothing to forget.
    }
  };
  useEffect(() => {
    if (!hasHydrated || lines.length === 0 || referralTried.current) return;
    // Next tick, so a StrictMode re-run of this effect doesn't skip it.
    const timer = window.setTimeout(() => {
      if (referralTried.current) return;
      referralTried.current = true;
      let stored: string | null = null;
      try {
        stored = decodeStoredReferral(localStorage.getItem(referralStorageKey(slug)));
      } catch {
        return;
      }
      if (stored) void applyCode(stored);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, lines.length]);
  const needsAddress = !zone?.isPickup;
  // The address comes before delivery, so the options can follow it; hidden when the only way is collection.
  const showAddress = deliveryOptions.length === 0 || deliveryOptions.some((o) => !o.isPickup);
  const optionPrice = (o: CheckoutDeliveryOption) => {
    const fee = deliveryFor(o).fee;
    return fee === 0 ? "Free" : money.format(money.convert(fee));
  };

  // A signed-in shopper's details (and, on a confirmed device, their last address) are filled in for them.
  const { account, address: savedAddress } = useShopAccount();
  const formRef = useRef<HTMLFormElement>(null);
  const prefilled = useRef(false);
  useEffect(() => {
    const form = formRef.current;
    if (!account || !form || prefilled.current) return;
    prefilled.current = true;
    // Set like typing does, so the fields' own change handlers run (delivery options depend on the address).
    const fill = (name: string, value: string | null | undefined) => {
      const input = form.elements.namedItem(name);
      if (!value || !(input instanceof HTMLInputElement || input instanceof HTMLSelectElement) || input.value) return;
      const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    };
    fill("name", account.name);
    fill("email", account.email);
    fill("phone", account.phone);
    if (savedAddress) {
      fill("line1", savedAddress.line1);
      fill("line2", savedAddress.line2);
      fill("city", savedAddress.city);
      fill("state", savedAddress.state);
    }
  }, [account, savedAddress, hasHydrated, lines.length]);

  // Analytics (only sent with the shopper's consent) and the abandoned-cart save.
  const started = useRef(false);
  const detailsTracked = useRef(false);
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!hasHydrated || lines.length === 0 || started.current) return;
    started.current = true;
    track({ type: "checkout_started", value: subtotal });
  }, [hasHydrated, lines.length, subtotal]);

  /** Saves the basket and contact details once there's a valid email or phone, so the shop can follow up if the shopper doesn't finish. */
  const saveCheckout = (form: HTMLFormElement) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const data = new FormData(form);
      const get = (n: FieldName) => String(data.get(n) ?? "").trim();
      const email = EMAIL_PATTERN.test(get("email")) ? get("email") : "";
      const phone = get("phone").replace(/\D/g, "").length >= 7 ? get("phone") : "";
      if (!email && !phone) return;
      fetch(`/api/shop/${encodeURIComponent(slug)}/checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: checkoutToken(slug),
          sessionId: analyticsSessionId(slug),
          name: get("name") || undefined,
          email: email || undefined,
          phone: phone || undefined,
          items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        }),
        keepalive: true,
      }).catch(() => undefined);
      if (!detailsTracked.current) {
        detailsTracked.current = true;
        track({ type: "checkout_details", value: subtotal });
      }
    }, 400);
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
      const next = validate(new FormData(form), Boolean(termsHref), needsAddress, stateLabel.toLowerCase());
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
    const found = validate(form, Boolean(termsHref), needsAddress, stateLabel.toLowerCase());
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((f) => found[f]);
    if (firstInvalid) {
      setStatus("Please correct the highlighted fields.");
      document.getElementById(`co-${firstInvalid}`)?.focus();
      return;
    }
    if (tooHeavy) {
      setStatus("Sorry, this order is too heavy for the delivery options in your area. Please contact the shop to arrange your order.");
      return;
    }
    if (noDeliveryHere) {
      setStatus("Sorry, this shop doesn't deliver to your address yet. Please contact the shop to arrange your order.");
      return;
    }

    setSubmitting(true);
    setStatus(method === "card" ? "Taking you to secure payment…" : "Placing your order…");
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
          checkoutToken: checkoutToken(slug),
          paymentMethod: method,
          discountCode: activeDiscount?.code,
          giftCardCode: giftCard?.code,
          loyaltyPoints: pointsToUse || undefined,
          marketingConsent: form.get("marketing") === "yes",
        }),
      });
      const data = await res.json().catch(() => ({}));
      const next = typeof data.authorizationUrl === "string" ? data.authorizationUrl : typeof data.receivedUrl === "string" ? data.receivedUrl : null;
      if (!res.ok || !next) {
        setStatus(typeof data.error === "string" ? data.error : "We couldn't place your order. Please try again.");
        setSubmitting(false);
        return;
      }
      track({ type: "payment_started", value: total });
      if (!data.authorizationUrl) {
        // Offline orders: on to the "order received" page, with payment details or WhatsApp.
        window.location.assign(next);
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
      <form
        ref={formRef}
        className="contact-form"
        onSubmit={submit}
        noValidate
        aria-label="Checkout"
        // Leaving the email, phone or name field saves the checkout for abandoned-cart follow-up.
        onBlur={(e) => {
          const target = e.target as EventTarget & { name?: string };
          if (target.name === "email" || target.name === "phone" || target.name === "name") saveCheckout(e.currentTarget);
        }}
      >
        <p className="body-copy">All fields are required unless marked optional.</p>

        <section className="checkout-step" aria-labelledby="step-contact">
          <h2 className="step-title" id="step-contact">
            <span className="step-num" aria-hidden="true">
              1
            </span>
            Contact details
          </h2>
          <p className="body-copy checkout-account">
            {account ? (
              <>
                Signed in as <strong>{account.email}</strong>. Your details are filled in for you.
              </>
            ) : (
              <>
                We&rsquo;ll set up your account from these details, so you can follow your order and check out faster next time. No password needed.{" "}
                <Link href={href("/account")}>Already have an account? Sign in</Link>
              </>
            )}
          </p>
          <div className="field">
            <label htmlFor="co-name">Full name</label>
            <input className="input" type="text" autoComplete="name" {...field("name")} />
            {errorFor("name")}
          </div>
          <div className="field">
            <label htmlFor="co-email">Email address</label>
            <input className="input" type="email" autoComplete="email" inputMode="email" {...field("email")} />
            <p className="hint">
              So the shop can contact you about your order. Your details and basket are saved as you type, so if you don&rsquo;t finish, the
              shop can help or email you a reminder (you can stop these at any time).
            </p>
            {errorFor("email")}
          </div>
          <div className="field">
            <label htmlFor="co-phone">Phone number</label>
            <input className="input" type="tel" autoComplete="tel" inputMode="tel" {...field("phone")} />
            <p className="hint">Only used for your order.</p>
            {errorFor("phone")}
          </div>
        </section>

        {showAddress ? (
          <section className="checkout-step" aria-labelledby="step-address">
            <h2 className="step-title" id="step-address">
              <span className="step-num" aria-hidden="true">
                2
              </span>
              Delivery address
            </h2>
            {!needsAddress ? <p className="hint">You&rsquo;re collecting your order, so you don&rsquo;t need to enter an address.</p> : null}
            <div className="field">
              <label htmlFor="co-line1">Address line 1{!needsAddress ? <span className="optional"> (optional)</span> : null}</label>
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
                <label htmlFor="co-city">Town or city{!needsAddress ? <span className="optional"> (optional)</span> : null}</label>
                <input className="input" type="text" autoComplete="address-level2" {...field("city")} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} />
                {errorFor("city")}
              </div>
              <div className="field">
                <label htmlFor="co-state">
                  {stateLabel}
                  {!needsAddress ? <span className="optional"> (optional)</span> : null}
                </label>
                {stateRegions ? (
                  <select
                    className="select"
                    autoComplete="address-level1"
                    defaultValue=""
                    id="co-state"
                    name="state"
                    aria-invalid={errors.state ? true : undefined}
                    aria-describedby={errors.state ? "co-state-error" : undefined}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAddress((a) => ({ ...a, state: value }));
                      if (errors.state && value) setErrors((prev) => ({ ...prev, state: undefined }));
                    }}
                  >
                    <option value="">Choose your {stateLabel.toLowerCase()}</option>
                    {stateRegions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className="input" type="text" autoComplete="address-level1" {...field("state")} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))} />
                )}
                {errorFor("state")}
              </div>
            </div>
          </section>
        ) : null}

        {deliveryOptions.length ? (
          <section className="checkout-step" aria-labelledby="step-delivery">
            <h2 className="step-title" id="step-delivery">
              <span className="step-num" aria-hidden="true">
                {showAddress ? 3 : 2}
              </span>
              Delivery method
            </h2>
            {/* Announced as the options change with the address. */}
            <p className={`delivery-note${noDeliveryHere || tooHeavy ? " delivery-note--warn" : ""}`} role="status">
              {tooHeavy
                ? "Sorry, this order is heavier than the delivery options for your area can carry. Please contact the shop to arrange it, or remove something from your basket."
                : noDeliveryHere
                ? `Sorry, this shop doesn't deliver to ${address.city.trim() || address.state.trim()} yet. Check your address, or contact the shop to arrange your order.`
                : waitingForAddress
                  ? "Enter your address above to see every delivery option for your area."
                  : addressKnown && offered.length < deliveryOptions.length
                    ? `Showing the ${offered.length === 1 ? "option" : "options"} that deliver to your address.`
                    : ""}
            </p>
            {offered.length ? (
              <fieldset>
                <legend className="visually-hidden">Choose a delivery method</legend>
                <div className="radio-cards">
                  {offered.map((o) => (
                    <label className="radio-card" key={o.id}>
                      <input type="radio" name="delivery" value={o.id} checked={zone?.id === o.id} onChange={() => setZoneId(o.id)} />
                      <span>
                        <strong>{o.name}</strong>
                        {o.etaText || o.isPickup ? <small>{o.isPickup ? o.etaText || "Collect from the shop" : o.etaText}</small> : null}
                      </span>
                      <span>{optionPrice(o)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </section>
        ) : null}

        <section className="checkout-step" aria-labelledby="step-payment">
          <h2 className="step-title" id="step-payment">
            <span className="step-num" aria-hidden="true">
              {2 + (deliveryOptions.length ? 1 : 0) + (showAddress ? 1 : 0)}
            </span>
            Payment
          </h2>
          {paymentMethods.length > 1 ? (
            <fieldset className="radio-cards">
              <legend className="visually-hidden">Choose how to pay</legend>
              {paymentMethods.map((m) => (
                <label className="radio-card" key={m}>
                  <input type="radio" name="paymentMethod" value={m} checked={method === m} onChange={() => setMethod(m)} />
                  <span>
                    <strong>{PAYMENT_COPY[m].title}</strong>
                    <span className="hint">{PAYMENT_COPY[m].text}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="payment-box">
              <p>
                <strong>{PAYMENT_COPY[method].title}</strong>
              </p>
              <p>{PAYMENT_COPY[method].text}</p>
            </div>
          )}
          <label className="check check--top">
            <input type="checkbox" name="marketing" value="yes" />
            <span>Send me news and offers from {storeName} by email. You can unsubscribe at any time.</span>
          </label>
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
            {submitting ? "Please wait…" : method === "card" ? `Pay ${money.formatHome(Math.max(total - giftUsed - pointsOff, 0))}` : `Place order (${money.formatHome(Math.max(total - giftUsed - pointsOff, 0))})`}
          </button>
          <p className="form-status" role="status">
            {status}
          </p>
        </section>
      </form>

      <aside className="summary" aria-labelledby="co-summary-title">
        <h2 id="co-summary-title">Your order</h2>
        {trade ? (
          <p className="price-change" role="status">
            Your trade prices are applied. They&rsquo;re checked again when you place your order.
          </p>
        ) : null}
        {pricesChanged && !trade ? (
          <p className="price-change" role="status">
            Some prices have changed since you added them to your basket. Your order shows today&rsquo;s prices.
          </p>
        ) : null}
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
              <span>{money.format(money.lineUnit(line) * line.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="discount-code">
          <label htmlFor="co-discount">Discount code <span className="optional">(optional)</span></label>
          <div className="promo">
            <input
              id="co-discount"
              className="input"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter applies the code rather than submitting the whole checkout.
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyCode();
                }
              }}
              aria-describedby="co-discount-status"
            />
            <button className="btn btn--outline" type="button" onClick={() => applyCode()} disabled={applyingCode}>
              {applyingCode ? "Checking…" : "Apply"}
            </button>
          </div>
          <p className="hint" id="co-discount-status" role="status">
            {discount && !activeDiscount ? "Your basket changed, so please apply your code again." : codeMessage}
          </p>
          {activeDiscount ? (
            <p className="discount-code__applied">
              <Icon name="check" size="sm" /> <strong>{activeDiscount.code}</strong> {activeDiscount.description}{" "}
              <button type="button" className="link-button" onClick={() => { setDiscount(null); forgetReferral(); setCodeMessage("Discount code removed."); }}>
                Remove<span className="visually-hidden"> discount code {activeDiscount.code}</span>
              </button>
            </p>
          ) : null}
        </div>
        <div className="discount-code">
          <label htmlFor="co-giftcard">Gift card <span className="optional">(optional)</span></label>
          {giftCard ? (
            <p className="discount-code__applied">
              <Icon name="check" size="sm" /> <strong>{giftCard.code}</strong> {money.format(money.convert(giftCard.balance))} on this card{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setGiftCard(null);
                  setGiftMessage("Gift card removed.");
                }}
              >
                Remove<span className="visually-hidden"> gift card {giftCard.code}</span>
              </button>
            </p>
          ) : (
            <div className="promo">
              <input
                id="co-giftcard"
                className="input"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={giftInput}
                onChange={(e) => setGiftInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyGiftCard();
                  }
                }}
                aria-describedby="co-giftcard-status"
              />
              <button className="btn btn--outline" type="button" onClick={applyGiftCard} disabled={checkingGift}>
                {checkingGift ? "Checking…" : "Apply"}
              </button>
            </div>
          )}
          <p className="hint" id="co-giftcard-status" role="status">
            {giftMessage}
          </p>
        </div>
        {pointSettings && loyalty && availablePoints > 0 ? (
          <div className="discount-code">
            <label className="check check--top">
              <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
              <span>
                Use my points: {availablePoints.toLocaleString("en-GB")} points for {money.format(money.convert(pointsValue(pointSettings, availablePoints)))} off
                <span className="hint"> You have {loyalty.balance.toLocaleString("en-GB")} points.</span>
              </span>
            </label>
          </div>
        ) : null}
        <dl>
          {zone || activeDiscount || taxResult.amount > 0 || giftCard || pointsToUse > 0 ? (
            <>
              <dt>Subtotal</dt>
              <dd>{money.format(shownSubtotal)}</dd>
            </>
          ) : null}
          {activeDiscount && !activeDiscount.freeDelivery ? (
            <>
              <dt>Discount ({activeDiscount.code})</dt>
              <dd>−{money.format(shownDiscount)}</dd>
            </>
          ) : null}
          {zone ? (
            <>
              <dt>{zone.isPickup ? "Collection" : freeDeliveryCode ? `Delivery (${activeDiscount?.code})` : "Delivery"}</dt>
              <dd>{deliveryFee === 0 ? (freeDeliveryCode && !zone.isPickup ? "Free delivery" : "Free") : money.format(shownDeliveryFee)}</dd>
            </>
          ) : null}
          {taxResult.amount > 0 && !taxResult.inclusive ? (
            <>
              <dt>{taxLabel(tax)}</dt>
              <dd>{money.format(shownTax)}</dd>
            </>
          ) : null}
          {giftCard ? (
            <>
              <dt>Gift card</dt>
              <dd>−{money.format(shownGift)}</dd>
            </>
          ) : null}
          {pointsToUse > 0 ? (
            <>
              <dt>Points ({pointsToUse.toLocaleString("en-GB")})</dt>
              <dd>−{money.format(shownPointsOff)}</dd>
            </>
          ) : null}
          <dt className="total">{giftCard || pointsToUse > 0 ? "To pay" : "Total"}</dt>
          <dd className="total">{money.format(giftCard || pointsToUse > 0 ? shownToPay : shownTotal)}</dd>
        </dl>
        {taxResult.amount > 0 && taxResult.inclusive ? (
          <p className="tax-note">
            Includes {tax.name} of {money.format(shownTax)}
          </p>
        ) : null}
        {delivery.rule ? (
          <p className="hint free-delivery-note">
            <Icon name="truck" size="sm" /> {delivery.rule.name}
          </p>
        ) : null}
        <ChargeNote homeAmount={Math.max(total - giftUsed - pointsOff, 0)} />
        <Link className="link-arrow" href={href(STORE_PATHS.cart)}>
          Edit basket
        </Link>
      </aside>
    </div>
  );
}
