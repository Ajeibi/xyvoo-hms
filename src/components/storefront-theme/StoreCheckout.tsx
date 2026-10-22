"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import { analyticsSessionId, checkoutToken, track } from "@/lib/store/analytics-client";
import type { CheckoutPaymentMethod } from "@/lib/store/offline-payments";
import { calculateCartTotals, cartLineKey, type CartLine } from "@/lib/shop/cart";
import type { PurchaseLine } from "@/lib/store/ad-pixels";
import { STORE_PATHS } from "@/lib/store/site/links";
import { deliveryWithRules, type CheckoutFreeRule } from "@/lib/store/free-delivery";
import { fitsWeight, orderWeightKg, zoneCovers, type WeightBand } from "@/lib/store/delivery";
import { COUNTRY_REGIONS, regionLabel } from "@/lib/store/regions";
import { allocateDiscount, computeTax, taxLabel, type TaxSettings } from "@/lib/store/tax";
import { decodeStoredReferral, referralStorageKey } from "@/lib/store/referral-link";
import { getBasketCode, readCheckoutDetails, saveCheckoutDetails, setBasketCode } from "@/lib/shop/basket-code";
import { pointsValue, redeemablePoints, type LoyaltySettings } from "@/lib/store/loyalty";
import type { Translator } from "@/lib/store/i18n/translate";
import { useMoney, useStorefront, useT } from "./StorefrontProvider";
import { currentPushSubscription, linkPush } from "./push-client";
import ChargeNote from "./ChargeNote";
import { useBasketPrices } from "./useBasketPrices";
import { useShopAccount } from "./useShopAccount";
import { Icon, StoreImage } from "./primitives";
import PhoneField, { toInternational } from "@/components/storefront/onboarding/PhoneField";
import { isValidPhoneNumber } from "react-phone-number-input";

type FieldName = "name" | "email" | "phone" | "line1" | "line2" | "city" | "state" | "terms";
type Errors = Partial<Record<FieldName, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Nigeria" for "NG", in the shopper's language. */
function countryNameFor(code: string, lang: string) {
  try {
    return new Intl.DisplayNames([lang === "en" ? "en-GB" : lang], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The basket for the shop's ad pixels, with the product feed's ids (each option's own, or the product's). */
const pixelLines = (lines: CartLine[]): PurchaseLine[] =>
  lines.map((l) => ({ itemId: l.variantId ?? l.productId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice }));

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

function validate(form: FormData, needsTerms: boolean, needsAddress: boolean, t: Translator, stateLabel = "state"): Errors {
  const value = (name: FieldName) => String(form.get(name) ?? "").trim();
  const errors: Errors = {};
  if (!value("email")) errors.email = t("checkout.errEmailRequired");
  else if (!EMAIL_PATTERN.test(value("email"))) errors.email = t("checkout.errEmailFormat");
  if (!isValidPhoneNumber(value("phone"))) errors.phone = t("checkout.errPhone");
  if (!value("name")) errors.name = t("checkout.errFullName");
  if (needsAddress) {
    if (!value("line1")) errors.line1 = t("checkout.errLine1");
    if (!value("city")) errors.city = t("checkout.errCity");
    if (!value("state")) errors.state = t("checkout.errRegion", { region: stateLabel });
  }
  if (needsTerms && !form.get("terms")) errors.terms = t("checkout.errTerms");
  return errors;
}

/** The words for each way to pay (keys in the checkout dictionary). */
const PAYMENT_COPY = {
  card: { title: "checkout.payCardTitle", text: "checkout.payCardText" },
  bank_transfer: { title: "checkout.payBankTitle", text: "checkout.payBankText" },
  pay_on_delivery: { title: "checkout.payOnDeliveryTitle", text: "checkout.payOnDeliveryText" },
  whatsapp: { title: "checkout.payWhatsAppTitle", text: "checkout.payWhatsAppText" },
} as const satisfies Record<CheckoutPaymentMethod, { title: string; text: string }>;

/** What regionLabel() calls a country's states, in the shopper's language. */
const REGION_WORDS = {
  State: "checkout.regionState",
  Region: "checkout.regionRegion",
  County: "checkout.regionCounty",
  Province: "checkout.regionProvince",
  "State or region": "checkout.regionStateOrRegion",
} as const;

const FIELD_ORDER: FieldName[] = ["email", "phone", "name", "line1", "line2", "city", "state", "terms"];

export default function StoreCheckout({
  countryCode,
  storeName,
  termsHref,
  privacyHref,
  deliveryReturnsHref,
  deliveryOptions,
  freeRules,
  tax,
  paymentMethods,
  offerWhatsAppUpdates,
  initialPaymentMethod,
}: {
  countryCode: string;
  storeName: string;
  termsHref: string | null;
  privacyHref: string | null;
  /** The shop's delivery and returns page, linked beside the pay button. */
  deliveryReturnsHref?: string | null;
  deliveryOptions: CheckoutDeliveryOption[];
  /** The shop's free delivery rules; checked again on the server. */
  freeRules: CheckoutFreeRule[];
  tax: CheckoutTax;
  paymentMethods: CheckoutPaymentMethod[];
  /** The shop sends order updates on WhatsApp, so the shopper can ask for them. */
  offerWhatsAppUpdates: boolean;
  /** Chosen to start with: "Order on WhatsApp" on a product or the basket opens checkout with ?pay=whatsapp. */
  initialPaymentMethod?: CheckoutPaymentMethod;
}) {
  const { slug, href, push } = useStorefront();
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const [errors, setErrors] = useState<Errors>({});
  // After a submit with problems: a list of them at the top, each linked to its field.
  const [showSummary, setShowSummary] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [zoneId, setZoneId] = useState(deliveryOptions[0]?.id ?? null);
  const [method, setMethod] = useState<CheckoutPaymentMethod>(
    initialPaymentMethod && paymentMethods.includes(initialPaymentMethod) ? initialPaymentMethod : (paymentMethods[0] ?? "card"),
  );
  const money = useMoney();
  const t = useT();
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
  const regionWord = regionLabel(countryCode);
  const stateLabel = regionWord in REGION_WORDS ? t(REGION_WORDS[regionWord as keyof typeof REGION_WORDS]) : regionWord;
  const countryName = countryNameFor(countryCode, t.lang);
  // A line taken off sale or sold out since it was added (see useBasketPrices): checkout waits until it's removed.
  const blocked = lines.some((l) => l.problem);

  const applyGiftCard = async () => {
    const typed = giftInput.trim();
    if (!typed) return setGiftMessage(t("checkout.enterGiftCode"));
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
        setGiftMessage(typeof data.error === "string" ? data.error : t("checkout.couldntCheckGift"));
        return;
      }
      setGiftCard({ code: data.code, balance: Number(data.balance) || 0 });
      setGiftInput("");
      setGiftMessage(t("checkout.giftAdded", { amount: money.format(money.convert(Number(data.balance) || 0)) }));
    } catch {
      setGiftMessage(t("common.offline"));
    } finally {
      setCheckingGift(false);
    }
  };

  const applyCode = async (code?: string, fromBasket = false) => {
    const typed = (code ?? codeInput).trim();
    if (!typed) {
      setCodeMessage(t("checkout.enterDiscountCode"));
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
        if (fromBasket) setBasketCode(slug, null);
        setCodeMessage(typeof data.error === "string" ? data.error : t("checkout.couldntCheckCode"));
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
      setCodeMessage(t("checkout.codeApplied", { code: data.code, description: data.description }));
    } catch {
      setCodeMessage(t("common.offline"));
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
      // Else a code entered in the basket.
      const fromBasket = getBasketCode(slug);
      if (stored) void applyCode(stored);
      else if (fromBasket) void applyCode(fromBasket, true);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, lines.length]);
  const needsAddress = !zone?.isPickup;
  // The address comes before delivery, so the options can follow it; hidden when the only way is collection.
  const showAddress = deliveryOptions.length === 0 || deliveryOptions.some((o) => !o.isPickup);
  const optionPrice = (o: CheckoutDeliveryOption) => {
    const fee = deliveryFor(o).fee;
    return fee === 0 ? t("checkout.free") : money.format(money.convert(fee));
  };

  // A signed-in shopper's details (and, on a confirmed device, their last address) are filled in for them.
  const { account, address: savedAddress } = useShopAccount();
  const formRef = useRef<HTMLFormElement>(null);
  const prefilled = useRef(false);
  // The phone number in E.164 form (e.g. +234…), kept in a hidden field so the form reads it like the others.
  // A signed-in shopper's number fills it until they type their own.
  // Back from a card payment that didn't go through: the number typed before (see saveCheckoutDetails).
  const [typedPhone, setTypedPhone] = useState<string | null>(() => readCheckoutDetails(slug)?.phone ?? null);
  const phoneNumber = typedPhone ?? (account?.phone ? toInternational(account.phone, countryCode) : "");
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
    if (savedAddress) {
      fill("line1", savedAddress.line1);
      fill("line2", savedAddress.line2);
      fill("city", savedAddress.city);
      fill("state", savedAddress.state);
    }
  }, [account, savedAddress, hasHydrated, lines.length]);

  // Back from a card payment that didn't go through ("Try again"): the form as the shopper left it.
  const restored = useRef(false);
  useEffect(() => {
    const form = formRef.current;
    if (!form || restored.current || !hasHydrated || !lines.length) return;
    restored.current = true;
    const saved = readCheckoutDetails(slug);
    if (!saved) return;
    for (const name of ["name", "email", "line1", "line2", "city", "state", "postcode", "note"] as const) {
      const input = form.elements.namedItem(name);
      const value = saved[name];
      if (!value || !(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) || input.value) continue;
      const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    }
  }, [hasHydrated, lines.length, slug]);

  // Analytics (only sent with the shopper's consent) and the abandoned-cart save.
  const started = useRef(false);
  const detailsTracked = useRef(false);
  // The basket's reminder also goes to this device when it already has the shop's notifications (asked once).
  const pushLinked = useRef(false);
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!hasHydrated || lines.length === 0 || started.current) return;
    started.current = true;
    track({ type: "checkout_started", value: subtotal, lines: pixelLines(lines) });
  }, [hasHydrated, lines, subtotal]);

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
      })
        .then(async (res) => {
          if (!res.ok || pushLinked.current) return;
          pushLinked.current = true;
          const sub = await currentPushSubscription(push);
          if (sub) await linkPush(slug, { kind: "checkout", endpoint: sub.endpoint, token: checkoutToken(slug) });
        })
        .catch(() => undefined);
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
      const next = validate(new FormData(form), Boolean(termsHref), needsAddress, t, stateLabel.toLowerCase());
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
    const found = validate(form, Boolean(termsHref), needsAddress, t, stateLabel.toLowerCase());
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((f) => found[f]);
    if (firstInvalid) {
      setStatus(t("checkout.fixHighlighted"));
      setShowSummary(true);
      // The summary is drawn on this render; focus it on the next frame.
      window.requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    setShowSummary(false);
    if (blocked) {
      setStatus(t("checkout.blockedSubmit"));
      return;
    }
    if (tooHeavy) {
      setStatus(t("checkout.tooHeavySubmit"));
      return;
    }
    if (noDeliveryHere) {
      setStatus(t("checkout.noDeliverySubmit"));
      return;
    }

    setSubmitting(true);
    setStatus(method === "card" ? t("checkout.toSecurePayment") : t("checkout.placingOrder"));
    // Kept for this tab, so "Try again" after a card payment that didn't go through brings it back.
    const typed = (name: string) => String(form.get(name) ?? "").trim() || undefined;
    saveCheckoutDetails(slug, { name: typed("name"), email: typed("email"), phone: typed("phone"), line1: typed("line1"), line2: typed("line2"), city: typed("city"), state: typed("state"), postcode: typed("postcode"), note: typed("note") });
    const get = (name: FieldName) => String(form.get(name) ?? "").trim() || undefined;

    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: get("name"), email: get("email"), phone: get("phone") },
          shippingAddress: needsAddress
            ? { line1: get("line1"), line2: get("line2"), city: get("city"), state: get("state"), postalCode: String(form.get("postcode") ?? "").trim() || undefined, country: countryCode }
            : { country: countryCode },
          items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
          deliveryZoneId: zone?.id ?? null,
          checkoutToken: checkoutToken(slug),
          paymentMethod: method,
          discountCode: activeDiscount?.code,
          giftCardCode: giftCard?.code,
          loyaltyPoints: pointsToUse || undefined,
          marketingConsent: form.get("marketing") === "yes",
          whatsappUpdates: form.get("whatsappUpdates") === "yes",
          note: String(form.get("note") ?? "").trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const next = typeof data.authorizationUrl === "string" ? data.authorizationUrl : typeof data.receivedUrl === "string" ? data.receivedUrl : null;
      if (!res.ok || !next) {
        setStatus(typeof data.error === "string" ? data.error : t("checkout.couldntPlaceOrder"));
        setSubmitting(false);
        return;
      }
      track({ type: "payment_started", value: total, lines: pixelLines(lines) });
      if (!data.authorizationUrl) {
        // Offline orders: on to the "order received" page, with payment details or WhatsApp.
        window.location.assign(next);
        return;
      }
      // The basket is kept until payment is confirmed, so an abandoned payment can be retried.
      window.location.assign(data.authorizationUrl);
    } catch {
      setStatus(t("common.offline"));
      setSubmitting(false);
    }
  };

  if (!hasHydrated) {
    return (
      <p className="body-copy" role="status">
        {t("checkout.loadingBasket")}
      </p>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="cart-empty">
        <Icon name="bag" />
        <h2 className="h-section">{t("checkout.basketEmpty")}</h2>
        <p className="body-copy">{t("checkout.addBeforeCheckout")}</p>
        <Link className="btn btn--primary" href={href(STORE_PATHS.products)}>
          {t("checkout.startShopping")}
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
        aria-label={t("checkout.checkout")}
        // Leaving the email, phone or name field saves the checkout for abandoned-cart follow-up.
        onBlur={(e) => {
          const target = e.target as EventTarget & { name?: string; id?: string };
          if (target.name === "email" || target.name === "name" || target.id === "co-phone") saveCheckout(e.currentTarget);
        }}
      >
        {showSummary && FIELD_ORDER.some((f) => errors[f]) ? (
          <div className="error-summary" ref={errorSummary} tabIndex={-1} role="alert" aria-labelledby="co-error-summary-title">
            <h2 className="error-summary__title" id="co-error-summary-title">
              {t("checkout.problemTitle")}
            </h2>
            <ul>
              {FIELD_ORDER.filter((f) => errors[f]).map((f) => (
                <li key={f}>
                  <a
                    href={`#co-${f}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(`co-${f}`)?.focus();
                    }}
                  >
                    {errors[f]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="body-copy">{t("checkout.allRequired")}</p>

        <section className="checkout-step" aria-labelledby="step-contact">
          <h2 className="step-title" id="step-contact">
            <span className="step-num" aria-hidden="true">
              1
            </span>
            {t("checkout.contactDetails")}
          </h2>
          <p className="body-copy checkout-account">
            {account ? (
              <>
                {t.rich("checkout.signedInAs", { email: <strong>{account.email}</strong> })}
              </>
            ) : (
              <>
                {t("checkout.accountFromDetails")}{" "}
                <Link href={href("/account")}>{t("checkout.haveAccount")}</Link>
              </>
            )}
          </p>
          <div className="field">
            <label htmlFor="co-name">{t("checkout.fullName")}</label>
            <input className="input" type="text" autoComplete="name" {...field("name")} />
            {errorFor("name")}
          </div>
          <div className="field">
            <label htmlFor="co-email">{t("common.email")}</label>
            <input className="input" type="email" autoComplete="email" inputMode="email" {...field("email")} />
            <p className="hint">
              {t("checkout.emailHint")}
            </p>
            {errorFor("email")}
          </div>
          <div className="field">
            <label htmlFor="co-phone">{t("common.phone")}</label>
            <PhoneField
              id="co-phone"
              value={phoneNumber}
              onChange={(value) => {
                setTypedPhone(value);
                // The picker has no blur re-check like the other fields, so clear the error once the number is valid.
                if (errors.phone && isValidPhoneNumber(value)) setErrors((prev) => ({ ...prev, phone: undefined }));
              }}
              countryCode={countryCode}
              invalid={Boolean(errors.phone)}
              describedBy={errors.phone ? "co-phone-error" : undefined}
              lang={t.lang}
            />
            <input type="hidden" name="phone" value={phoneNumber} />
            <p className="hint">{t("checkout.phoneHint")}</p>
            {errorFor("phone")}
            {offerWhatsAppUpdates ? (
              <label className="check check--top">
                <input type="checkbox" name="whatsappUpdates" value="yes" />
                <span>{t("checkout.whatsappUpdates")}</span>
              </label>
            ) : null}
          </div>
        </section>

        {showAddress ? (
          <section className="checkout-step" aria-labelledby="step-address">
            <h2 className="step-title" id="step-address">
              <span className="step-num" aria-hidden="true">
                2
              </span>
              {t("checkout.deliveryAddress")}
            </h2>
            {/* Said before the address is typed, so nobody abroad fills it in for nothing. */}
            <p className="hint checkout-country">
              <Icon name="pin" size="sm" />
              <span>
                {t.rich("checkout.deliversWithin", { store: storeName, country: <strong>{countryName}</strong> })}
              </span>
            </p>
            {!needsAddress ? <p className="hint">{t("checkout.collectingNoAddress")}</p> : null}
            <div className="field">
              <label htmlFor="co-line1">{t("checkout.addressLine1")}{!needsAddress ? <span className="optional"> {t("common.optional")}</span> : null}</label>
              <input className="input" type="text" autoComplete="address-line1" {...field("line1")} />
              {errorFor("line1")}
            </div>
            <div className="field">
              <label htmlFor="co-line2">
                {t("checkout.addressLine2")} <span className="optional">{t("common.optional")}</span>
              </label>
              <input className="input" type="text" autoComplete="address-line2" {...field("line2")} />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="co-city">{t("checkout.townOrCity")}{!needsAddress ? <span className="optional"> {t("common.optional")}</span> : null}</label>
                <input className="input" type="text" autoComplete="address-level2" {...field("city")} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} />
                {errorFor("city")}
              </div>
              <div className="field">
                <label htmlFor="co-state">
                  {stateLabel}
                  {!needsAddress ? <span className="optional"> {t("common.optional")}</span> : null}
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
                    <option value="">{t("checkout.chooseRegion", { region: stateLabel.toLowerCase() })}</option>
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
            <div className="field field--short">
              <label htmlFor="co-postcode">
                {t("checkout.postcode")} <span className="optional">{t("common.optional")}</span>
              </label>
              <input className="input" type="text" autoComplete="postal-code" maxLength={20} id="co-postcode" name="postcode" />
            </div>
          </section>
        ) : null}

        {deliveryOptions.length ? (
          <section className="checkout-step" aria-labelledby="step-delivery">
            <h2 className="step-title" id="step-delivery">
              <span className="step-num" aria-hidden="true">
                {showAddress ? 3 : 2}
              </span>
              {t("checkout.deliveryMethod")}
            </h2>
            {/* Announced as the options change with the address. */}
            <p className={`delivery-note${noDeliveryHere || tooHeavy ? " delivery-note--warn" : ""}`} role="status">
              {tooHeavy
                ? t("checkout.tooHeavyNote")
                : noDeliveryHere
                ? t("checkout.noDeliveryHere", { place: address.city.trim() || address.state.trim() })
                : waitingForAddress
                  ? t("checkout.enterAddressForOptions")
                  : addressKnown && offered.length < deliveryOptions.length
                    ? t("checkout.showingOptions", { count: offered.length })
                    : ""}
            </p>
            {offered.length ? (
              <fieldset>
                <legend className="visually-hidden">{t("checkout.chooseDeliveryMethod")}</legend>
                <div className="radio-cards">
                  {offered.map((o) => (
                    <label className="radio-card" key={o.id}>
                      <input type="radio" name="delivery" value={o.id} checked={zone?.id === o.id} onChange={() => setZoneId(o.id)} />
                      <span>
                        <strong>{o.name}</strong>
                        {o.etaText || o.isPickup ? <small>{o.isPickup ? o.etaText || t("checkout.collectFromShop") : o.etaText}</small> : null}
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
            {t("checkout.payment")}
          </h2>
          {paymentMethods.length > 1 ? (
            <fieldset className="radio-cards">
              <legend className="visually-hidden">{t("checkout.chooseHowToPay")}</legend>
              {paymentMethods.map((m) => (
                <label className="radio-card" key={m}>
                  <input type="radio" name="paymentMethod" value={m} checked={method === m} onChange={() => setMethod(m)} />
                  <span>
                    <strong>{t(PAYMENT_COPY[m].title)}</strong>
                    <span className="hint">{t(PAYMENT_COPY[m].text)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="payment-box">
              <p>
                <strong>{t(PAYMENT_COPY[method].title)}</strong>
              </p>
              <p>{t(PAYMENT_COPY[method].text)}</p>
            </div>
          )}
          <div className="field">
            <label htmlFor="co-note">
              {t("checkout.noteFor", { store: storeName })} <span className="optional">{t("common.optional")}</span>
            </label>
            <textarea className="input" id="co-note" name="note" rows={2} maxLength={500} aria-describedby="co-note-hint" />
            <p className="hint" id="co-note-hint">
              {t("checkout.noteHint")}
            </p>
          </div>
          <label className="check check--top">
            <input type="checkbox" name="marketing" value="yes" />
            <span>{t("checkout.marketingConsent", { store: storeName })}</span>
          </label>
          {termsHref ? (
            <>
              <label className="check check--top">
                <input type="checkbox" value="yes" {...field("terms")} />
                <span>
                  {privacyHref
                    ? t.rich("checkout.agreeTermsPrivacy", {
                        terms: <Link href={termsHref}>{t("checkout.termsOfSale")}</Link>,
                        privacy: <Link href={privacyHref}>{t("checkout.privacyPolicy")}</Link>,
                      })
                    : t.rich("checkout.agreeTerms", { terms: <Link href={termsHref}>{t("checkout.termsOfSale")}</Link> })}
                </span>
              </label>
              {errorFor("terms")}
            </>
          ) : null}
          {blocked ? (
            <p className="cart-line__problem" role="status">
              {t.rich("checkout.blockedCheckout", { link: <Link href={href(STORE_PATHS.cart)}>{t("checkout.removeFromBasket")}</Link> })}
            </p>
          ) : null}
          <button className="btn btn--primary" type="submit" disabled={submitting || blocked}>
            <Icon name="lock" size="sm" />
            {submitting
              ? t("checkout.pleaseWait")
              : method === "card"
                ? t("checkout.payAmount", { amount: money.formatHome(Math.max(total - giftUsed - pointsOff, 0)) })
                : t("checkout.placeOrderAmount", { amount: money.formatHome(Math.max(total - giftUsed - pointsOff, 0)) })}
          </button>
          <p className="form-status" role="status">
            {status}
          </p>
          <p className="checkout-trust">
            <Icon name="lock" size="sm" /> {method === "card" ? t("checkout.trustCard") : t("checkout.trustOffline")}
            {deliveryReturnsHref ? (
              <>
                {" "}
                <Link href={deliveryReturnsHref}>{t("checkout.deliveryReturns")}</Link>
              </>
            ) : null}
          </p>
        </section>
      </form>

      <aside className="summary" aria-labelledby="co-summary-title">
        <h2 id="co-summary-title">{t("checkout.yourOrder")}</h2>
        {trade ? (
          <p className="price-change" role="status">
            {t("checkout.tradePrices")}
          </p>
        ) : null}
        {pricesChanged && !trade ? (
          <p className="price-change" role="status">
            {t("checkout.pricesChangedOrder")}
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
                  {line.variantLabel ? `${line.variantLabel} · ` : ""}{t("checkout.qty", { quantity: line.quantity })}
                </span>
              </span>
              <span>{money.format(money.lineUnit(line) * line.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="discount-code">
          <label htmlFor="co-discount">{t("checkout.discountCode")} <span className="optional">{t("common.optional")}</span></label>
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
              {applyingCode ? t("checkout.checking") : t("checkout.apply")}
            </button>
          </div>
          <p className="hint" id="co-discount-status" role="status">
            {discount && !activeDiscount ? t("checkout.codeChanged") : codeMessage}
          </p>
          {activeDiscount ? (
            <p className="discount-code__applied">
              <Icon name="check" size="sm" /> <strong>{activeDiscount.code}</strong> {activeDiscount.description}{" "}
              <button type="button" className="link-button" onClick={() => { setDiscount(null); forgetReferral(); setBasketCode(slug, null); setCodeMessage(t("checkout.discountRemoved")); }}>
                {t("common.remove")}<span className="visually-hidden"> {t("checkout.discountCodeHidden", { code: activeDiscount.code })}</span>
              </button>
            </p>
          ) : null}
        </div>
        <div className="discount-code">
          <label htmlFor="co-giftcard">{t("checkout.giftCard")} <span className="optional">{t("common.optional")}</span></label>
          {giftCard ? (
            <p className="discount-code__applied">
              <Icon name="check" size="sm" /> <strong>{giftCard.code}</strong> {t("checkout.giftOnCard", { amount: money.format(money.convert(giftCard.balance)) })}{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setGiftCard(null);
                  setGiftMessage(t("checkout.giftRemoved"));
                }}
              >
                {t("common.remove")}<span className="visually-hidden"> {t("checkout.giftCardHidden", { code: giftCard.code })}</span>
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
                {checkingGift ? t("checkout.checking") : t("checkout.apply")}
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
                {t("checkout.usePoints", { points: availablePoints, amount: money.format(money.convert(pointsValue(pointSettings, availablePoints))) })}
                <span className="hint"> {t("checkout.youHavePoints", { points: loyalty.balance })}</span>
              </span>
            </label>
          </div>
        ) : null}
        <dl>
          {zone || activeDiscount || taxResult.amount > 0 || giftCard || pointsToUse > 0 ? (
            <>
              <dt>{t("checkout.subtotal")}</dt>
              <dd>{money.format(shownSubtotal)}</dd>
            </>
          ) : null}
          {activeDiscount && !activeDiscount.freeDelivery ? (
            <>
              <dt>{t("checkout.discountWithCode", { code: activeDiscount.code })}</dt>
              <dd>−{money.format(shownDiscount)}</dd>
            </>
          ) : null}
          {zone ? (
            <>
              <dt>{zone.isPickup ? t("checkout.collection") : freeDeliveryCode ? t("checkout.deliveryWithCode", { code: activeDiscount?.code ?? "" }) : t("checkout.delivery")}</dt>
              <dd>{deliveryFee === 0 ? (freeDeliveryCode && !zone.isPickup ? t("checkout.freeDelivery") : t("checkout.free")) : money.format(shownDeliveryFee)}</dd>
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
              <dt>{t("checkout.giftCard")}</dt>
              <dd>−{money.format(shownGift)}</dd>
            </>
          ) : null}
          {pointsToUse > 0 ? (
            <>
              <dt>{t("checkout.pointsCount", { points: pointsToUse })}</dt>
              <dd>−{money.format(shownPointsOff)}</dd>
            </>
          ) : null}
          <dt className="total">{giftCard || pointsToUse > 0 ? t("checkout.toPay") : t("checkout.total")}</dt>
          <dd className="total">{money.format(giftCard || pointsToUse > 0 ? shownToPay : shownTotal)}</dd>
        </dl>
        {taxResult.amount > 0 && taxResult.inclusive ? (
          <p className="tax-note">
            {t("checkout.includesNamedTax", { tax: tax.name, amount: money.format(shownTax) })}
          </p>
        ) : null}
        {delivery.rule ? (
          <p className="hint free-delivery-note">
            <Icon name="truck" size="sm" /> {delivery.rule.name}
          </p>
        ) : null}
        <ChargeNote homeAmount={Math.max(total - giftUsed - pointsOff, 0)} />
        <Link className="link-arrow" href={href(STORE_PATHS.cart)}>
          {t("checkout.editBasket")}
        </Link>
      </aside>
    </div>
  );
}
