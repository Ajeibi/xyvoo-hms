"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ShopProduct } from "@/lib/shop/products";
import { CURRENCY_NAMES, type ShopCurrencyCode } from "@/lib/store/currencies";
import type { CheckoutPaymentMethod } from "@/lib/store/offline-payments";
import { useMoney, useT } from "./StorefrontProvider";
import { useStorefront } from "./StorefrontProvider";
import { useShopAccount } from "./useShopAccount";

/** The words for each way to pay (keys in the checkout dictionary). */
const PAY_LABELS = {
  card: "checkout.giftPayCard",
  bank_transfer: "checkout.giftPayBank",
  pay_on_delivery: "checkout.giftPayOnDelivery",
  whatsapp: "checkout.giftPayWhatsApp",
} as const satisfies Record<CheckoutPaymentMethod, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The gift card's own page: choose an amount, say who it's for and add a
 * message, then pay. It doesn't go in the basket; the card is emailed to them
 * as soon as the payment is confirmed.
 */
export default function GiftCardBuy({ product, storeName, paymentMethods }: { product: ShopProduct; storeName: string; paymentMethods: CheckoutPaymentMethod[] }) {
  const { slug } = useStorefront();
  const money = useMoney();
  const t = useT();
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
  // A gift card holds its value in the shop's own currency, so amounts are always shown in it.
  const amountText = (amount: number) => money.formatHome(amount);
  const homeName = (() => {
    if (t.lang !== "en") {
      try {
        const name = new Intl.DisplayNames([t.lang], { type: "currency" }).of(money.homeCurrency ?? "");
        if (name) return name;
      } catch {
        // No name for it in this language: the English one below.
      }
    }
    return CURRENCY_NAMES[money.homeCurrency as ShopCurrencyCode] ?? money.homeCurrency;
  })();

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
      ? t("checkout.errChooseAmount")
      : !get("recipientName")
        ? t("checkout.errRecipientName")
        : !EMAIL.test(get("recipientEmail"))
          ? t("checkout.errRecipientEmail")
          : !get("buyerName")
            ? t("checkout.errYourName")
            : !EMAIL.test(get("buyerEmail"))
              ? t("checkout.errYourEmail")
              : !method
                ? t("checkout.noOnlinePayments")
                : "";
    if (problem) return setStatus(problem);

    setSending(true);
    setStatus(method === "card" ? t("checkout.toSecurePayment") : t("checkout.placingOrder"));
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
        setStatus(typeof data.error === "string" ? data.error : t("checkout.couldntPlaceOrder"));
        setSending(false);
        return;
      }
      window.location.assign(next);
    } catch {
      setStatus(t("common.offline"));
      setSending(false);
    }
  };

  return (
    <div className="giftcard">
      <div className="giftcard__preview" aria-hidden="true">
        <span className="giftcard__shop">{storeName}</span>
        <span className="giftcard__amount">{chosen ? amountText(chosen.amount) : t("checkout.giftCard")}</span>
        <span className="giftcard__label">{t("checkout.giftCard")}</span>
      </div>

      <form ref={formRef} className="giftcard__form account-form" onSubmit={submit} noValidate aria-label={t("checkout.buyGiftCard")}>
        <h1 className="h-page">{t("checkout.giftCard")}</h1>
        <p className="lead">
          {t("checkout.giftLead")}
        </p>

        <fieldset className="option-group">
          <legend>
            {t.rich("checkout.amountLegend", { amount: <span>{chosen ? amountText(chosen.amount) : t("checkout.chooseOne")}</span> })}
          </legend>
          <div className="pills">
            {amounts.map((a) => (
              <label className="pill" key={a.id}>
                <input type="radio" name="amount" value={a.id} checked={variantId === a.id} onChange={() => setVariantId(a.id)} />
                <span>{amountText(a.amount)}</span>
              </label>
            ))}
          </div>
          {!money.isHome && chosen ? (
            <p className="hint charge-note">
              {t("checkout.aboutAmount", { amount: money.format(money.convert(chosen.amount)), currency: homeName })}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="giftcard__group">
          <legend>{t("checkout.whoFor")}</legend>
          <div className="field">
            <label htmlFor={`${id}-rname`}>{t("checkout.theirName")}</label>
            <input className="input" id={`${id}-rname`} name="recipientName" autoComplete="off" maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-remail`}>{t("checkout.theirEmail")}</label>
            <input className="input" id={`${id}-remail`} name="recipientEmail" type="email" inputMode="email" autoComplete="off" maxLength={200} />
            <p className="hint">{t("checkout.sendHereHint")}</p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-message`}>
              {t("checkout.yourMessage")} <span className="optional">{t("common.optional")}</span>
            </label>
            <textarea className="input" id={`${id}-message`} name="message" rows={3} maxLength={300} />
          </div>
        </fieldset>

        <fieldset className="giftcard__group">
          <legend>{t("checkout.aboutYou")}</legend>
          <div className="field">
            <label htmlFor={`${id}-bname`}>{t("checkout.yourName")}</label>
            <input className="input" id={`${id}-bname`} name="buyerName" autoComplete="name" maxLength={120} />
            <p className="hint">{t("checkout.shownOnEmail")}</p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-bemail`}>{t("checkout.yourEmail")}</label>
            <input className="input" id={`${id}-bemail`} name="buyerEmail" type="email" inputMode="email" autoComplete="email" maxLength={200} />
            <p className="hint">{t("checkout.forReceipt")}</p>
          </div>
        </fieldset>

        {methods.length > 1 ? (
          <fieldset className="giftcard__group">
            <legend>{t("checkout.howToPay")}</legend>
            {methods.map((m) => (
              <label className="check check--top" key={m}>
                <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                <span>{t(PAY_LABELS[m])}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <button className="btn btn--primary" type="submit" disabled={sending || !methods.length}>
          {sending ? t("checkout.pleaseWait") : chosen ? t("checkout.buyGiftCardAmount", { amount: amountText(chosen.amount) }) : t("checkout.buyGiftCard")}
        </button>
        {!methods.length ? <p className="hint">{t("checkout.noOnlinePayments")}</p> : null}
        <p className="form-status" role="status">
          {status}
        </p>
      </form>
    </div>
  );
}
