"use client";

import { useEffect, useId, useState } from "react";
import { formatShopCurrency } from "@/lib/shop/format";
import { TRADE_STATUS_LABELS, type TradeStatus } from "@/lib/store/wholesale";
import { announce, useStorefront } from "./StorefrontProvider";

type TradeState = { enabled: boolean; status: TradeStatus; business?: string | null; message?: string | null; minOrder?: number };

/** "Trade account" on the Account page: apply, and see where the application stands. Shown only when the shop takes trade customers. */
export default function TradeApply() {
  const { slug, currency } = useStorefront();
  const id = useId();
  const [state, setState] = useState<TradeState | null>(null);
  const [business, setBusiness] = useState("");
  const [about, setAbout] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`/api/shop/${encodeURIComponent(slug)}/account/trade`, { cache: "no-store" })
      .then((res): Promise<TradeState | null> => (res.ok ? res.json() : Promise.resolve(null)))
      .then(setState)
      .catch(() => setState(null));
  }, [slug]);

  if (!state?.enabled) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (business.trim().length < 2) return setStatus("Tell us the name of your business.");
    setSending(true);
    setStatus("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/account/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: business.trim(), about: about.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(typeof body.error === "string" ? body.error : "We couldn't send your application. Please try again.");
        return;
      }
      setState({ ...state, status: "pending", business: business.trim() });
      announce("Application sent");
    } catch {
      setStatus("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="account-card" aria-labelledby={`${id}-trade`}>
      <h2 className="h-section" id={`${id}-trade`}>
        Trade account
      </h2>
      {state.status === "approved" ? (
        <p className="body-copy">
          <strong>{TRADE_STATUS_LABELS.approved}.</strong> You&rsquo;ll see trade prices on products and in your basket while you&rsquo;re signed in.
          {state.minOrder ? ` Trade orders come to at least ${formatShopCurrency(state.minOrder, currency)} in items.` : ""}
        </p>
      ) : state.status === "pending" ? (
        <p className="body-copy" role="status">
          Your application{state.business ? ` for ${state.business}` : ""}{" "}
          is with the shop. We&rsquo;ll email you as soon as they&rsquo;ve decided.
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="body-copy">
            {state.status === "declined"
              ? `The shop couldn't offer you a trade account last time${state.message ? `: “${state.message}”` : ""}. Apply again to see trade prices.`
              : "Buy for your business? Apply for a trade account to see trade prices."}
          </p>
          <div className="field">
            <label htmlFor={`${id}-business`}>Business name</label>
            <input id={`${id}-business`} className="input" value={business} maxLength={120} onChange={(e) => setBusiness(e.target.value)} autoComplete="organization" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-about`}>
              Tell the shop about your business <span className="optional">(optional)</span>
            </label>
            <textarea id={`${id}-about`} className="input" rows={3} maxLength={500} value={about} onChange={(e) => setAbout(e.target.value)} />
          </div>
          <button className="btn btn--primary" type="submit" disabled={sending}>
            {sending ? "Sending…" : "Apply for a trade account"}
          </button>
          <p className="form-status" role="status">
            {status}
          </p>
        </form>
      )}
    </section>
  );
}
