"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { STORE_PATHS } from "@/lib/store/site/links";
import { CodeForm, CreateAccountForm, SignInForm } from "./AccountForms";
import { formatShopCurrency } from "@/lib/shop/format";
import { announce, useStorefront } from "./StorefrontProvider";
import { LOYALTY_REASON_LABELS, type LoyaltyReason } from "@/lib/store/loyalty";
import ReturnRequest from "./ReturnRequest";
import TradeApply from "./TradeApply";
import { RETURN_REASON_LABELS, RETURN_STATUS_LABELS, type ReturnReason, type ReturnStatus } from "@/lib/store/returns";
import { refreshShopAccount, useShopAccount, type ShopAccount, type ShopLoyalty, type ShopReferral } from "./useShopAccount";

type MyReturn = { id: string; orderRef: string; status: ReturnStatus; reason: ReturnReason; shopMessage: string | null; items: { orderItemId: string; name: string; quantity: number }[]; createdAt: string };
type Order = { id: string; reference: string; createdAt: string; status: string; paymentStatus: string; total: number; currency: string | null; items: string[] };

/** /account: sign in or create an account, then your details, your orders and how the shop may contact you. */
export default function AccountPage({ storeName, privacyHref }: { storeName: string; privacyHref: string | null }) {
  const { status, account } = useShopAccount();
  const [mode, setMode] = useState<"signin" | "create">("signin");

  if (status === "loading") {
    return (
      <p className="body-copy" role="status">
        Loading your account…
      </p>
    );
  }

  if (!account) {
    return (
      <div className="account-grid">
        <section className="account-card" aria-labelledby="account-signin-title">
          <h2 className="h-section" id="account-signin-title">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h2>
          {mode === "signin" ? (
            <SignInForm storeName={storeName} onDone={() => undefined} />
          ) : (
            <CreateAccountForm source="account_page" storeName={storeName} privacyHref={privacyHref} onDone={() => undefined} />
          )}
          <p className="account-switch">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button type="button" className="link-button" onClick={() => setMode(mode === "signin" ? "create" : "signin")}>
              {mode === "signin" ? "Create an account" : "Sign in instead"}
            </button>
          </p>
        </section>
        <aside className="account-card account-card--soft" aria-label="About accounts">
          <h2 className="h-section">Why have an account?</h2>
          <ul className="account-benefits">
            <li>Check out faster: your details are filled in for you.</li>
            <li>Your basket follows you to your phone, tablet or computer.</li>
            <li>See all your orders with {storeName} in one place.</li>
          </ul>
          <p className="body-copy">
            You don&rsquo;t need one to shop. If you order without one, we&rsquo;ll set it up from your checkout details. There&rsquo;s never a password to remember.
          </p>
        </aside>
      </div>
    );
  }

  return <SignedIn account={account} storeName={storeName} />;
}

function SignedIn({ account, storeName }: { account: ShopAccount; storeName: string }) {
  const { slug, href, currency } = useStorefront();
  const id = useId();
  const [name, setName] = useState(account.name ?? "");
  const [phone, setPhone] = useState(account.phone ?? "");
  const [consent, setConsent] = useState(account.contactConsent);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [points, setPoints] = useState<ShopLoyalty | null>(null);
  const [referral, setReferral] = useState<ShopReferral | null>(null);
  const [copied, setCopied] = useState(false);
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

  const copyCode = async () => {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.code);
      setCopied(true);
      announce(`Code ${referral.code} copied`);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Copying isn't available here; the code is on the page to copy by hand.
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setStatus("Enter your name.");
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "We couldn't save your details. Please try again.");
      await refreshShopAccount(slug);
      setStatus("Your details are saved.");
    } catch (err) {
      setStatus(err instanceof TypeError ? "We couldn't connect. Check your internet connection and try again." : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await fetch(`/api/shop/${encodeURIComponent(slug)}/account`, { method: "DELETE" }).catch(() => undefined);
    await refreshShopAccount(slug);
    announce("You're signed out.");
  };

  const confirmEmail = async () => {
    setConfirming(true);
    await fetch(`/api/shop/${encodeURIComponent(slug)}/account/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: account.email }),
    }).catch(() => undefined);
  };

  const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="account-grid">
      <section className="account-card" aria-labelledby={`${id}-details`}>
        <h2 className="h-section" id={`${id}-details`}>
          Your details
        </h2>
        <p className="body-copy">
          Signed in as <strong>{account.email}</strong>.{" "}
          <button type="button" className="link-button" onClick={signOut}>
            Sign out
          </button>
        </p>
        <form className="account-form" onSubmit={save} noValidate>
          <div className="field">
            <label htmlFor={`${id}-name`}>Your name</label>
            <input className="input" id={`${id}-name`} autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-phone`}>
              Phone number <span className="optional">(optional)</span>
            </label>
            <input className="input" id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <label className="check check--top">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{storeName} can contact me about my basket, new arrivals and offers.</span>
          </label>
          <div className="account-form__actions">
            <button className="btn btn--primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save my details"}
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
            Your points
          </h2>
          <p className="body-copy">
            You have <strong>{points.balance.toLocaleString("en-GB")} points</strong>, worth {formatShopCurrency(points.balance * points.pointValue, currency)} off your next order. You earn {points.pointsPer100} for every 100 you spend, once an order has been delivered.
          </p>
          {points.history?.length ? (
            <ul className="account-orders">
              {points.history.map((h) => (
                <li key={h.id}>
                  <div className="account-orders__top">
                    <strong>{LOYALTY_REASON_LABELS[h.reason as LoyaltyReason] ?? "Points"}</strong>
                    <span>
                      {h.points > 0 ? "+" : "−"}
                      {Math.abs(h.points).toLocaleString("en-GB")}
                    </span>
                  </div>
                  <p className="account-orders__meta">{new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{h.note ? ` · ${h.note}` : ""}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {referral ? (
        <section className="account-card" aria-labelledby={`${id}-friends`}>
          <h2 className="h-section" id={`${id}-friends`}>
            Tell a friend
          </h2>
          <p className="body-copy">
            Share your code with a friend. They get {referral.friendOffer} when they type it at checkout, and once their order has been delivered you get {referral.reward}.
          </p>
          <p className="body-copy">
            <strong>{referral.code}</strong>{" "}
            <button type="button" className="btn btn--outline" onClick={copyCode}>
              {copied ? "Copied" : "Copy code"}
              <span className="visually-hidden"> {referral.code}</span>
            </button>
          </p>
          {referral.friends > 0 ? (
            <p className="body-copy">
              {referral.friends} {referral.friends === 1 ? "friend has" : "friends have"} ordered with your code so far. Thank you!
            </p>
          ) : null}
        </section>
      ) : null}

      {account.confirmed ? <TradeApply /> : null}

      <section className="account-card" aria-labelledby={`${id}-orders`}>
        <h2 className="h-section" id={`${id}-orders`}>
          Your orders
        </h2>
        {!account.confirmed ? (
          confirming ? (
            <CodeForm email={account.email} intro={`We've emailed a 6-digit code to ${account.email}. Enter it to see your orders.`} onDone={() => setConfirming(false)} />
          ) : (
            <>
              <p className="body-copy">To keep your orders private, confirm it&rsquo;s you first. We&rsquo;ll email you a code.</p>
              <button type="button" className="btn btn--outline" onClick={confirmEmail}>
                Email me a code
              </button>
            </>
          )
        ) : orders === null ? (
          <p className="body-copy" role="status">
            Loading your orders…
          </p>
        ) : orders.length === 0 ? (
          <>
            <p className="body-copy">You haven&rsquo;t ordered yet. When you do, your orders will appear here.</p>
            <Link className="btn btn--outline" href={href(STORE_PATHS.products)}>
              Start shopping
            </Link>
          </>
        ) : (
          <ul className="account-orders">
            {orders.map((o) => (
              <li key={o.id}>
                <div className="account-orders__top">
                  <strong>Order {o.reference}</strong>
                  <span>{formatShopCurrency(o.total, o.currency || currency)}</span>
                </div>
                <p className="account-orders__meta">
                  {when(o.createdAt)} · {o.status}
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
            Your returns
          </h2>
          <ul className="account-orders">
            {returns.map((r) => (
              <li key={r.id}>
                <div className="account-orders__top">
                  <strong>Order {r.orderRef}</strong>
                  <span>{RETURN_STATUS_LABELS[r.status]}</span>
                </div>
                <p className="account-orders__meta">
                  {when(r.createdAt)} · {RETURN_REASON_LABELS[r.reason]}
                </p>
                <p className="account-orders__items">{r.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</p>
                {r.shopMessage ? <p className="account-orders__meta">Message from the shop: {r.shopMessage}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
