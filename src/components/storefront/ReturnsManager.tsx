"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2, Clock, PackageCheck, RotateCcw } from "lucide-react";
import Link from "next/link";
import { availableReturnActions, RETURN_ACTION_LABELS, RETURN_REASON_LABELS, RETURN_STATUS_LABELS, type ReturnAction, type ReturnStatus } from "@/lib/store/returns";
import type { ReturnRow } from "@/lib/store/returns-server";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashSectionIntro, DashStatStrip, DashStatTile, DashStatus, sendJson } from "./dashboard-ui";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

type Loaded = { returns: ReturnRow[]; windowDays: number; canChangeWindow: boolean };

const TONE: Record<ReturnStatus, "slate" | "green" | "amber" | "red" | "blue"> = { requested: "amber", approved: "blue", declined: "red", received: "blue", completed: "green", cancelled: "slate" };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Dashboard → Returns: requests from customers, and what to do with each. */
export default function ReturnsManager({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState<{ id: string; action: ReturnAction } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`/api/store/returns?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load returns.");
        setData(body);
      })
      .catch(() => setError("We couldn't load returns. Please refresh the page."));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!data) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <p className="text-sm text-slate-600" role="status">
        Loading returns…
      </p>
    );
  }

  const waiting = data.returns.filter((r) => r.status === "requested").length;
  const coming = data.returns.filter((r) => r.status === "approved").length;
  const received = data.returns.filter((r) => r.status === "received").length;

  const run = async (r: ReturnRow, action: ReturnAction, withNote: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendJson(`/api/store/returns/${r.id}`, "POST", { slug, action, message: withNote });
      setOpen(null);
      setNote("");
      setMessage(
        action === "approve"
          ? "Approved. The customer has been emailed."
          : action === "decline"
            ? "Declined. The customer has been emailed."
            : action === "received"
              ? "Marked as received. The customer has been emailed. You can now refund it from the order."
              : action === "complete"
                ? "Marked as completed."
                : "Return cancelled.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Approving, declining and receiving tell the customer, so they can add a message. Others happen straight away. */
  const asksForMessage = (a: ReturnAction) => a === "approve" || a === "decline" || a === "received";

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="returns"
        meaning="orders"
        art="people"
        title="Handle returns calmly"
        points={[
          "A customer can ask to return something from their account once an order has been delivered, within the days you allow.",
          "Approve or decline it. Either way the customer is emailed, and you can add a message such as where to send the item.",
          "When it arrives, mark it received, then refund it from the order page, where you can also put the stock back.",
        ]}
      />

      <DashStatStrip label="Returns in figures" columns={3}>
        <DashStatTile label="Waiting for you" meaning="orders" icon={Clock} hint="Approve or decline these" value={String(waiting)} />
        <DashStatTile label="On their way back" meaning="stock" icon={RotateCcw} hint="Approved, not yet received" value={String(coming)} />
        <DashStatTile label="Ready to refund" meaning="money" icon={PackageCheck} hint="Received, not yet completed" value={String(received)} />
      </DashStatStrip>

      <DashAlert message={error} />
      <DashStatus message={message} />
      <WindowCard slug={slug} days={data.windowDays} editable={data.canChangeWindow} onSaved={(windowDays) => setData({ ...data, windowDays })} />

      <DashCard id="returns-list" icon={RotateCcw} title="Return requests" description="Newest first.">
        {data.returns.length === 0 ? (
          <DashEmptyState art="people" meaning="orders" title="No returns yet" description="When a customer asks to return something, it appears here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.returns.map((r) => {
              const actions = availableReturnActions(r.status);
              return (
                <li key={r.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        Order{" "}
                        <Link href={`/storefront/${slug}/orders/${r.orderId}`} className={`rounded text-blue-800 hover:underline ${focusRing}`}>
                          {r.orderRef}
                        </Link>
                      </p>
                      <p className="break-all text-sm text-slate-600">
                        {r.customerEmail} · asked {when(r.createdAt)}
                      </p>
                    </div>
                    <DashPill tone={TONE[r.status]}>{RETURN_STATUS_LABELS[r.status]}</DashPill>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-sm text-slate-800">
                    {r.items.map((i) => (
                      <li key={i.orderItemId}>
                        {i.quantity} × {i.name}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-sm text-slate-600">
                    {RETURN_REASON_LABELS[r.reason]}
                    {r.note ? `: “${r.note}”` : ""}
                  </p>
                  {r.shopMessage ? <p className="mt-1 text-sm text-slate-600">Your message: {r.shopMessage}</p> : null}

                  {actions.length ? (
                    open?.id === r.id ? (
                      <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                        <ActionNote id={`${r.id}-note`} label={`Message to the customer (optional)`} value={note} onChange={setNote} />
                        <div className="flex gap-2">
                          <button type="button" disabled={busy} onClick={() => run(r, open.action, note)} className={`${dashButton.primary} ${focusRing}`}>
                            {busy ? "Saving…" : RETURN_ACTION_LABELS[open.action]}
                          </button>
                          <button type="button" onClick={() => setOpen(null)} className={`${dashButton.secondary} ${focusRing}`}>
                            Not now
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {actions.map((a) => (
                          <button
                            key={a}
                            type="button"
                            disabled={busy}
                            onClick={() => (asksForMessage(a) ? (setOpen({ id: r.id, action: a }), setNote("")) : run(r, a, ""))}
                            className={`${a === "decline" || a === "cancel" ? dashButton.danger : a === "approve" || a === "received" ? dashButton.primary : dashButton.secondary} ${focusRing}`}
                          >
                            {a === "complete" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
                            {RETURN_ACTION_LABELS[a]}
                            <span className="sr-only"> for order {r.orderRef}</span>
                          </button>
                        ))}
                      </div>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </DashCard>
    </div>
  );
}

function ActionNote({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <DashField id={id} label={label}>
      <textarea id={id} className={`${dashInput} min-h-20`} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} />
    </DashField>
  );
}

function WindowCard({ slug, days, editable, onSaved }: { slug: string; days: number; editable: boolean; onSaved: (d: number) => void }) {
  const id = useId();
  const [value, setValue] = useState(String(days));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await sendJson("/api/store/returns", "PUT", { slug, windowDays: value });
      onSaved(res.windowDays);
      setMessage(res.windowDays === 0 ? "Saved. Customers can't ask to return items." : `Saved. Customers can ask to return items for ${res.windowDays} days after delivery.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard id="returns-window" icon={Clock} title="How long customers have" description="After an order is delivered. A product can set its own days, or say it can't be returned, on its page in Products.">
      <div className="space-y-3">
        <DashAlert message={error} />
        <DashStatus message={message} />
        <div className="max-w-xs">
          <DashField id={`${id}-days`} label="Days after delivery" hint="Use 0 if you don't take returns.">
            <input id={`${id}-days`} className={dashInput} type="number" inputMode="numeric" min={0} max={365} step={1} value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} aria-describedby={`${id}-days-hint`} />
          </DashField>
        </div>
        {editable ? (
          <button type="button" onClick={save} disabled={saving} className={`${dashButton.primary} ${focusRing}`}>
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <p className="text-sm text-slate-600">Only the owner or an admin can change this.</p>
        )}
      </div>
    </DashCard>
  );
}
