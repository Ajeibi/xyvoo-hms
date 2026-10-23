"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { STORE_PATHS } from "@/lib/store/site/links";
import { CodeForm, CreateAccountForm, SignInForm } from "./AccountForms";
import { formatShopCurrency } from "@/lib/shop/format";
import { announce, useStorefront, useT } from "./StorefrontProvider";
import type { LoyaltyReason } from "@/lib/store/loyalty";
import ReturnRequest, { RETURN_REASON_KEYS } from "./ReturnRequest";
import TradeApply from "./TradeApply";
import type { ReturnReason, ReturnStatus } from "@/lib/store/returns";
import type { MessageKey } from "@/lib/store/i18n/messages";
import { refreshShopAccount, useShopAccount, type ShopAccount, type ShopLoyalty, type ShopReferral } from "./useShopAccount";

type MyReturn = { id: string; orderRef: string; status: ReturnStatus; reason: ReturnReason; shopMessage: string | null; items: { orderItemId: string; name: string; quantity: number }[]; createdAt: string };
type Order = { id: string; reference: string; createdAt: string; status: string; paymentStatus: string; total: number; currency: string | null; items: string[] };

/* Stored values, shown in the shopper's language (the values themselves never change). */
const ORDER_STATUS_KEYS: Record<string, MessageKey> = {
  Pending: "account.statusPending",
  Confirmed: "account.statusConfirmed",
  Shipped: "account.statusShipped",
  Delivered: "account.statusDelivered",
  Cancelled: "account.statusCancelled",
};
const RETURN_STATUS_KEYS: Record<ReturnStatus, MessageKey> = {
  requested: "account.returnStatusRequested",
  approved: "account.returnStatusApproved",
  declined: "account.returnStatusDeclined",
  received: "account.returnStatusReceived",
  completed: "account.returnStatusCompleted",
  cancelled: "account.returnStatusCancelled",
};
const LOYALTY_REASON_KEYS: Record<LoyaltyReason, MessageKey> = {
  earned: "account.loyaltyEarned",
  redeemed: "account.loyaltyRedeemed",
  returned: "account.loyaltyReturned",
  reversed: "account.loyaltyReversed",
  adjusted: "account.loyaltyAdjusted",
  expired: "account.loyaltyExpired",
};

/** /account: sign in or create an account, then your details, your orders and how the shop may contact you. */
export default function AccountPage({ storeName, privacyHref }: { storeName: string; privacyHref: string | null }) {
  const { status, account } = useShopAccount();
  const t = useT();
  const [mode, setMode] = useState<"signin" | "create">("signin");

  if (status === "loading") {
    return (
      <p className="body-copy" role="status">
        {t("account.loadingAccount")}
      </p>
    );
  }

  if (!account) {
    return (
      <div className="account-grid">
        <section className="account-card" aria-labelledby="account-signin-title">
          <h2 className="h-section" id="account-signin-title">
            {mode === "signin" ? t("account.signIn") : t("account.createYourAccount")}
          </h2>
          {mode === "signin" ? (
            <SignInForm storeName={storeName} onDone={() => undefined} />
          ) : (
            <CreateAccountForm source="account_page" storeName={storeName} privacyHref={privacyHref} onDone={() => undefined} />
          )}
          <p className="account-switch">
            {t.rich(mode === "signin" ? "account.newHere" : "account.alreadyHaveAccount", {
              link: (
                <button type="button" className="link-button" onClick={() => setMode(mode === "signin" ? "create" : "signin")}>
                  {mode === "signin" ? t("account.createAnAccount") : t("account.signInInstead")}
                </button>
              ),
            })}
          </p>
        </section>
        <aside className="account-card account-card--soft" aria-label={t("account.aboutAccounts")}>
          <h2 className="h-section">{t("account.whyAccount")}</h2>
          <ul className="account-benefits">
            <li>{t("account.benefitFaster")}</li>
            <li>{t("account.benefitBasket")}</li>
            <li>{t("account.benefitOrders", { storeName })}</li>
          </ul>
          <p className="body-copy">{t("account.noNeed")}</p>
        </aside>
      </div>
    );
  }

  return <SignedIn account={account} storeName={storeName} />;
}

function SignedIn({ account, storeName }: { account: ShopAccount; storeName: string }) {
  const { slug, href, currency } = useStorefront();
  const t = useT();
  const id = useId();
  const [name, setName] = useState(account.name ?? "");
  const [phone, setPhone] = useState(account.phone ?? "");
  const [consent, setConsent] = useState(account.contactConsent);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [points, setPoints] = useState<ShopLoyalty | null>(null);
  const [referral, setReferral] = useState<ShopReferral | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [returns, setReturns] = useState<MyReturn[]>([]);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!account.confirmed) return;
    fetch(`/api/shop/${encodeURIComponent(slug)}/account?orders=1&loyalty=1`, { cache: "no-store" })
      .then((res): Promise<{ orders?: unknown; loyalty?: ShopLoyalty | null }> => (res.ok ? res.json() : Promise.resolve({})))
      .then((body) => {
        setOrders(Array.isArray(body.orders) ? body.orders : []);
        setPoints(body.loyalty ?? null);
      })
      .catch(() => setOrders([]));
  }, [account.confirmed, slug]);

  useEffect(() => {
    if (!account.confirmed) return;
    fetch(`/api/shop/${encodeURIComponent(slug)}/account/referral`, { cache: "no-store" })
      .then((res): Promise<{ referral?: ShopReferral | null }> => (res.ok ? res.json() : Promise.resolve({})))
      .then((body) => setReferral(body.referral ?? null))
      .catch(() => setReferral(null));
  }, [account.confirmed, slug]);

  const loadReturns = () =>
    fetch(`/api/shop/${encodeURIComponent(slug)}/account/returns`, { cache: "no-store" })
      .then((res): Promise<{ returns?: MyReturn[] }> => (res.ok ? res.json() : Promise.resolve({})))
      .then((body) => setReturns(body.returns ?? []))
      .catch(() => setReturns([]));

  useEffect(() => {
    if (!account.confirmed) return;
    void loadReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.confirmed, slug]);

  const copyShare = async (what: "code" | "link") => {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(what === "code" ? referral.code : referral.link);
      setCopied(what);
      announce(what === "code" ? t("account.codeCopied", { code: referral.code }) : t("account.linkCopied"));
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      // Copying isn't available here; the code is on the page to copy by hand.
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setStatus(t("account.enterName"));
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : t("account.saveDetailsFailed"));
      await refreshShopAccount(slug);
      setStatus(t("account.detailsSaved"));
    } catch (err) {
      setStatus(err instanceof TypeError ? t("common.offline") : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await fetch(`/api/shop/${encodeURIComponent(slug)}/account`, { method: "DELETE" }).catch(() => undefined);
    await refreshShopAccount(slug);
    announce(t("account.signedOut"));
  };

  const confirmEmail = async () => {
    setConfirming(true);
    await fetch(`/api/shop/${encodeURIComponent(slug)}/account/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: account.email }),
    }).catch(() => undefined);
  };

  const when = (iso: string) => new Date(iso).toLocaleDateString(t.lang, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="account-grid">
      <section className="account-card" aria-labelledby={`${id}-details`}>
        <h2 className="h-section" id={`${id}-details`}>
          {t("account.yourDetails")}
        </h2>
        <p className="body-copy">
          {t.rich("account.signedInAs", { email: <strong>{account.email}</strong> })}{" "}
          <button type="button" className="link-button" onClick={signOut}>
            {t("account.signOut")}
          </button>
        </p>
        <form className="account-form" onSubmit={save} noValidate>
          <div className="field">
            <label htmlFor={`${id}-name`}>{t("account.yourName")}</label>
            <input className="input" id={`${id}-name`} autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-phone`}>
              {t("common.phone")} <span className="optional">{t("common.optional")}</span>
            </label>
            <input className="input" id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <label className="check check--top">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t("account.contactConsent", { storeName })}</span>
          </label>
          <div className="account-form__actions">
            <button className="btn btn--primary" type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("account.saveDetails")}
            </button>
          </div>
          <p className="form-status" role="status">
            {status}
          </p>
        </form>
      </section>

      {points ? (
        <section className="account-card" aria-labelledby={`${id}-points`}>
          <h2 className="h-section" id={`${id}-points`}>
            {t("account.yourPoints")}
          </h2>
          <p className="body-copy">
            {t.rich("account.pointsSummary", {
              points: <strong>{t("account.pointsCount", { count: points.balance })}</strong>,
              value: formatShopCurrency(points.balance * points.pointValue, currency),
              per100: points.pointsPer100,
            })}
          </p>
          {points.history?.length ? (
            <ul className="account-orders">
              {points.history.map((h) => (
                <li key={h.id}>
                  <div className="account-orders__top">
                    <strong>{LOYALTY_REASON_KEYS[h.reason as LoyaltyReason] ? t(LOYALTY_REASON_KEYS[h.reason as LoyaltyReason]) : t("account.loyaltyOther")}</strong>
                    <span>
                      {h.points > 0 ? "+" : "−"}
                      {Math.abs(h.points).toLocaleString(t.lang)}
                    </span>
                  </div>
                  <p className="account-orders__meta">{new Date(h.createdAt).toLocaleDateString(t.lang, { day: "numeric", month: "short", year: "numeric" })}{h.note ? ` · ${h.note}` : ""}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {referral ? (
        <section className="account-card" aria-labelledby={`${id}-friends`}>
          <h2 className="h-section" id={`${id}-friends`}>
            {t("account.tellFriend")}
          </h2>
          <p className="body-copy">{t("account.referralIntro", { offer: referral.friendOffer, reward: referral.reward })}</p>
          <p className="body-copy">
            <strong>{referral.code}</strong>{" "}
            <button type="button" className="btn btn--outline" onClick={() => copyShare("code")}>
              {copied === "code" ? t("account.copied") : t("account.copyCode")}
              <span className="visually-hidden"> {referral.code}</span>
            </button>{" "}
            <button type="button" className="btn btn--outline" onClick={() => copyShare("link")}>
              {copied === "link" ? t("account.copied") : t("account.copyLink")}
              <span className="visually-hidden"> {t("account.copyLinkPurpose")}</span>
            </button>
          </p>
          {referral.friends > 0 ? (
            <p className="body-copy">{t("account.friendsOrdered", { count: referral.friends })}</p>
          ) : null}
        </section>
      ) : null}

      {account.confirmed ? <TradeApply /> : null}

      <section className="account-card" aria-labelledby={`${id}-orders`}>
        <h2 className="h-section" id={`${id}-orders`}>
          {t("account.yourOrders")}
        </h2>
        {!account.confirmed ? (
          confirming ? (
            <CodeForm email={account.email} intro={t("account.codeSentOrders", { email: account.email })} onDone={() => setConfirming(false)} />
          ) : (
            <>
              <p className="body-copy">{t("account.confirmFirst")}</p>
              <button type="button" className="btn btn--outline" onClick={confirmEmail}>
                {t("account.emailMeCode")}
              </button>
            </>
          )
        ) : orders === null ? (
          <p className="body-copy" role="status">
            {t("account.loadingOrders")}
          </p>
        ) : orders.length === 0 ? (
          <>
            <p className="body-copy">{t("account.noOrders")}</p>
            <Link className="btn btn--outline" href={href(STORE_PATHS.products)}>
              {t("account.startShopping")}
            </Link>
          </>
        ) : (
          <ul className="account-orders">
            {orders.map((o) => (
              <li key={o.id}>
                <div className="account-orders__top">
                  <strong>{t("account.orderRef", { reference: o.reference })}</strong>
                  <span>{formatShopCurrency(o.total, o.currency || currency)}</span>
                </div>
                <p className="account-orders__meta">
                  {when(o.createdAt)} · {ORDER_STATUS_KEYS[o.status] ? t(ORDER_STATUS_KEYS[o.status]) : o.status}
                </p>
                <p className="account-orders__items">{o.items.join(", ")}</p>
                {o.status === "Delivered" && o.paymentStatus === "paid" ? <ReturnRequest orderRef={o.reference} orderId={o.id} onRequested={() => void loadReturns()} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {returns.length ? (
        <section className="account-card" aria-labelledby={`${id}-returns`}>
          <h2 className="h-section" id={`${id}-returns`}>
            {t("account.yourReturns")}
          </h2>
          <ul className="account-orders">
            {returns.map((r) => (
              <li key={r.id}>
                <div className="account-orders__top">
                  <strong>{t("account.orderRef", { reference: r.orderRef })}</strong>
                  <span>{RETURN_STATUS_KEYS[r.status] ? t(RETURN_STATUS_KEYS[r.status]) : r.status}</span>
                </div>
                <p className="account-orders__meta">
                  {when(r.createdAt)} · {RETURN_REASON_KEYS[r.reason] ? t(RETURN_REASON_KEYS[r.reason]) : r.reason}
                </p>
                <p className="account-orders__items">{r.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</p>
                {r.shopMessage ? <p className="account-orders__meta">{t("account.shopMessage", { message: r.shopMessage })}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
