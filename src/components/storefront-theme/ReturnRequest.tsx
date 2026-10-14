"use client";

import { useId, useState } from "react";
import { RETURN_REASON_LABELS, RETURN_REASONS, type ReturnReason } from "@/lib/store/returns";
import { announce, useStorefront } from "./StorefrontProvider";

type Eligible = { orderId: string; lines: { orderItemId: string; name: string; maxQuantity: number }[] };

/**
 * "Return something" under a delivered order: choose what, how many and why.
 * Opens only when asked, so nobody loads return details they don't need.
 */
export default function ReturnRequest({ orderRef, orderId, onRequested }: { orderRef: string; orderId: string; onRequested: () => void }) {
  const { slug } = useStorefront();
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
      if (!res.ok) setStatus(typeof body.error === "string" ? body.error : "We couldn't check this order. Please try again.");
      else if (!body.order || body.order.lines.length === 0) setStatus(typeof body.message === "string" ? body.message : "Nothing in this order can be returned any more.");
      else setEligible(body.order);
    } catch {
      setStatus("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const chosen = Object.entries(quantities).filter(([, q]) => q > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen.length) return setStatus("Choose at least one item to return.");
    if (!reason) return setStatus("Choose a reason.");
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
        setStatus(typeof body.error === "string" ? body.error : "We couldn't send your request. Please try again.");
        return;
      }
      setDone(true);
      announce("Return requested");
      onRequested();
    } catch {
      setStatus("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <p className="form-status" role="status">
        Thank you. We&rsquo;ve asked the shop about returning these. You&rsquo;ll get an email when they reply.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="link-button" onClick={start}>
        Return something<span className="visually-hidden"> from order {orderRef}</span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label={`Return items from order ${orderRef}`} className="account-return">
      {loading ? <p className="hint">Checking what can be returned…</p> : null}
      {eligible ? (
        <>
          <fieldset>
            <legend>What would you like to return?</legend>
            {eligible.lines.map((l) => (
              <div key={l.orderItemId} className="field">
                <label htmlFor={`${id}-${l.orderItemId}`}>{l.name}</label>
                <select
                  id={`${id}-${l.orderItemId}`}
                  className="input"
                  value={quantities[l.orderItemId] ?? 0}
                  onChange={(e) => setQuantities({ ...quantities, [l.orderItemId]: Number(e.target.value) })}
                >
                  <option value={0}>Keep it</option>
                  {Array.from({ length: l.maxQuantity }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Return {n}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor={`${id}-reason`}>Why are you returning it?</label>
            <select id={`${id}-reason`} className="input" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
              <option value="">Choose a reason</option>
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {RETURN_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-note`}>
              Anything else the shop should know <span className="optional">(optional)</span>
            </label>
            <textarea id={`${id}-note`} className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn btn--primary" type="submit" disabled={sending}>
            {sending ? "Sending…" : "Ask to return these"}
          </button>{" "}
          <button className="btn btn--outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </>
      ) : null}
      <p className="form-status" role="status">
        {status}
      </p>
      {!eligible && !loading ? (
        <button className="btn btn--outline" type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      ) : null}
    </form>
  );
}
