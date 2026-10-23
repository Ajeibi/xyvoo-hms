"use client";

import { useEffect, useId, useState } from "react";
import { formatShopCurrency } from "@/lib/shop/format";
import type { TradeStatus } from "@/lib/store/wholesale";
import { announce, useStorefront, useT } from "./StorefrontProvider";

type TradeState = { enabled: boolean; status: TradeStatus; business?: string | null; message?: string | null; minOrder?: number };

/** "Trade account" on the Account page: apply, and see where the application stands. Shown only when the shop takes trade customers. */
export default function TradeApply() {
  const { slug, currency } = useStorefront();
  const t = useT();
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
    if (business.trim().length < 2) return setStatus(t("account.enterBusiness"));
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
        setStatus(typeof body.error === "string" ? body.error : t("account.tradeSendFailed"));
        return;
      }
      setState({ ...state, status: "pending", business: business.trim() });
      announce(t("account.applicationSent"));
    } catch {
      setStatus(t("common.offline"));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="account-card" aria-labelledby={`${id}-trade`}>
      <h2 className="h-section" id={`${id}-trade`}>
        {t("account.tradeAccount")}
      </h2>
      {state.status === "approved" ? (
        <p className="body-copy">
          {t.rich("account.tradeApproved", { status: <strong>{t("account.tradeAccount")}.</strong> })}
          {state.minOrder ? ` ${t("account.tradeMinOrder", { amount: formatShopCurrency(state.minOrder, currency) })}` : ""}
        </p>
      ) : state.status === "pending" ? (
        <p className="body-copy" role="status">
          {state.business ? t("account.tradePendingFor", { business: state.business }) : t("account.tradePending")}
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="body-copy">
            {state.status === "declined"
              ? state.message
                ? t("account.tradeDeclinedMessage", { message: state.message })
                : t("account.tradeDeclined")
              : t("account.tradeInvite")}
          </p>
          <div className="field">
            <label htmlFor={`${id}-business`}>{t("account.businessName")}</label>
            <input id={`${id}-business`} className="input" value={business} maxLength={120} onChange={(e) => setBusiness(e.target.value)} autoComplete="organization" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-about`}>
              {t("account.aboutBusiness")} <span className="optional">{t("common.optional")}</span>
            </label>
            <textarea id={`${id}-about`} className="input" rows={3} maxLength={500} value={about} onChange={(e) => setAbout(e.target.value)} />
          </div>
          <button className="btn btn--primary" type="submit" disabled={sending}>
            {sending ? t("common.sending") : t("account.applyTrade")}
          </button>
          <p className="form-status" role="status">
            {status}
          </p>
        </form>
      )}
    </section>
  );
}
