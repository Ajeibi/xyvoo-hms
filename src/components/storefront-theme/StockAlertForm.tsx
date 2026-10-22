"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { canUsePush, currentPushSubscription, subscribeToShopPush } from "./push-client";
import { useStorefront, useT } from "./StorefrontProvider";
import { useShopAccount } from "./useShopAccount";

const noopSubscribe = () => () => {};

/**
 * "Email me when it's back" on a sold-out product (or size or colour). Signed-in
 * shoppers just press the button; guests type their email. One email, once.
 * Where the shop sends notifications, a notification on this device instead.
 */
export default function StockAlertForm({ productId, variantId, label }: { productId: string; variantId: string | null; label: string }) {
  const { slug, push } = useStorefront();
  const t = useT();
  const pushable = useSyncExternalStore(noopSubscribe, () => canUsePush(push), () => false);
  const { account } = useShopAccount();
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // Done per product and size, so choosing another size offers the button again.
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const key = `${productId}:${variantId ?? ""}`;

  const send = async (extra: { email?: string; pushEndpoint?: string }) => {
    const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/stock-alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, variantId, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : t("product.saveFailed"));
    return data as { email: string | null; push?: boolean };
  };

  const notifyHere = async () => {
    if (!push) return;
    setBusy(true);
    setStatus("");
    try {
      const sub = (await currentPushSubscription(push)) ?? (await subscribeToShopPush(slug, push, false));
      if (sub === "blocked") return setStatus(t("product.notificationsBlocked"));
      if (sub === "failed") return setStatus(t("product.notificationsFailed"));
      await send({ pushEndpoint: sub.endpoint });
      setDoneFor(key);
      setStatus(t("product.alertPushDone", { product: label }));
    } catch (err) {
      setStatus(err instanceof TypeError ? t("common.offline") : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = email.trim();
    if (!account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) return setStatus(t("product.emailFormat"));
    setBusy(true);
    setStatus("");
    try {
      const data = await send({ email: account ? undefined : typed });
      setDoneFor(key);
      setStatus(t("product.alertEmailDone", { email: String(data.email), product: label }));
    } catch (err) {
      setStatus(err instanceof TypeError ? t("common.offline") : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stock-alert" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <p className="stock-alert__title" id={`${id}-title`}>
        {t("product.soldOutForNow")}
      </p>
      {doneFor === key ? null : (
        <>
          <p className="stock-alert__text">{t("product.alertIntro")}</p>
          {account ? null : (
            <div className="field">
              <label htmlFor={`${id}-email`}>{t("product.yourEmail")}</label>
              <input className="input" id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          <button className="btn btn--outline" type="submit" disabled={busy}>
            {busy ? t("common.saving") : t("product.emailWhenBack")}
          </button>
          {pushable ? (
            <button className="stock-alert__alt" type="button" onClick={notifyHere} disabled={busy}>
              {t("product.notifyDevice")}
            </button>
          ) : null}
        </>
      )}
      <p className="form-status" role="status">
        {doneFor === null || doneFor === key ? status : ""}
      </p>
    </form>
  );
}
