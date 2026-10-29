"use client";

import { useId, useState } from "react";
import { RETURN_REASONS, type ReturnReason } from "@/lib/store/returns";
import type { MessageKey } from "@/lib/store/i18n/messages";
import { announce, useStorefront, useT } from "./StorefrontProvider";

/** Return reasons in the shopper's language (the stored values stay as they are). */
export const RETURN_REASON_KEYS: Record<ReturnReason, MessageKey> = {
  wrong_size: "account.reasonWrongSize",
  not_as_described: "account.reasonNotAsDescribed",
  damaged: "account.reasonDamaged",
  changed_mind: "account.reasonChangedMind",
  other: "account.reasonOther",
};

type Eligible = { orderId: string; lines: { orderItemId: string; name: string; maxQuantity: number }[] };

/**
 * "Return something" under a delivered order: choose what, how many and why.
 * Opens only when asked, so nobody loads return details they don't need.
 */
export default function ReturnRequest({ orderRef, orderId, onRequested }: { orderRef: string; orderId: string; onRequested: () => void }) {
  const { slug } = useStorefront();
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eligible, setEligible] = useState<Eligible | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const start = async () => {
    setOpen(true);
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/account/returns?order=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setStatus(typeof body.error === "string" ? body.error : t("account.returnCheckFailed"));
      else if (!body.order || body.order.lines.length === 0) setStatus(typeof body.message === "string" ? body.message : t("account.nothingReturnable"));
      else setEligible(body.order);
    } catch {
      setStatus(t("common.offline"));
    } finally {
      setLoading(false);
    }
  };

  const chosen = Object.entries(quantities).filter(([, q]) => q > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen.length) return setStatus(t("account.chooseItem"));
    if (!reason) return setStatus(t("account.chooseReasonError"));
    setSending(true);
    setStatus("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/account/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, items: chosen.map(([orderItemId, quantity]) => ({ orderItemId, quantity })), reason, note: note.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(typeof body.error === "string" ? body.error : t("account.returnSendFailed"));
        return;
      }
      setDone(true);
      announce(t("account.returnRequested"));
      onRequested();
    } catch {
      setStatus(t("common.offline"));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <p className="form-status" role="status">
        {t("account.returnThanks")}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="link-button" onClick={start}>
        {t.rich("account.returnSomething", { fromOrder: <span className="visually-hidden">{t("account.fromOrderHidden", { reference: orderRef })}</span> })}
      </button>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label={t("account.returnFormLabel", { reference: orderRef })} className="account-return">
      {loading ? <p className="hint">{t("account.checkingReturnable")}</p> : null}
      {eligible ? (
        <>
          <fieldset>
            <legend>{t("account.whatReturn")}</legend>
            {eligible.lines.map((l) => (
              <div key={l.orderItemId} className="field">
                <label htmlFor={`${id}-${l.orderItemId}`}>{l.name}</label>
                <select
                  id={`${id}-${l.orderItemId}`}
                  className="input"
                  value={quantities[l.orderItemId] ?? 0}
                  onChange={(e) => setQuantities({ ...quantities, [l.orderItemId]: Number(e.target.value) })}
                >
                  <option value={0}>{t("account.keepIt")}</option>
                  {Array.from({ length: l.maxQuantity }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {t("account.returnQty", { count: n })}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor={`${id}-reason`}>{t("account.whyReturn")}</label>
            <select id={`${id}-reason`} className="input" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
              <option value="">{t("account.chooseReason")}</option>
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(RETURN_REASON_KEYS[r])}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-note`}>
              {t("account.anythingElse")} <span className="optional">{t("common.optional")}</span>
            </label>
            <textarea id={`${id}-note`} className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn btn--primary" type="submit" disabled={sending}>
            {sending ? t("common.sending") : t("account.askReturn")}
          </button>{" "}
          <button className="btn btn--outline" type="button" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </button>
        </>
      ) : null}
      <p className="form-status" role="status">
        {status}
      </p>
      {!eligible && !loading ? (
        <button className="btn btn--outline" type="button" onClick={() => setOpen(false)}>
          {t("common.close")}
        </button>
      ) : null}
    </form>
  );
}
