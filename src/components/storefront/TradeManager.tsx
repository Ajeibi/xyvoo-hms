"use client";

import { useEffect, useId, useState } from "react";
import { Briefcase, Clock, Users } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { nextTradeStatus, TRADE_STATUS_LABELS, type TradeAction, type TradeStatus, type WholesaleSettings } from "@/lib/store/wholesale";
import type { TradeAccountRow } from "@/lib/store/wholesale-server";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashSectionIntro, DashStatStrip, DashStatTile, DashStatus, sendJson } from "./dashboard-ui";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

type Loaded = { settings: WholesaleSettings; accounts: TradeAccountRow[]; currency: string };

const TONE: Record<TradeStatus, "slate" | "green" | "amber" | "red" | "blue"> = { none: "slate", pending: "amber", approved: "green", declined: "red" };
const ACTIONS: { action: TradeAction; label: string }[] = [
  { action: "approve", label: "Approve" },
  { action: "decline", label: "Decline" },
  { action: "revoke", label: "End their trade account" },
];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Dashboard → Trade accounts: who has applied, who is approved, and the rules for trade orders. */
export default function TradeManager({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState<{ id: string; action: TradeAction } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`/api/store/wholesale?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load trade accounts.");
        setData(body);
      })
      .catch(() => setError("We couldn't load trade accounts. Please refresh the page."));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!data) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <p className="text-sm text-slate-600" role="status">
        Loading trade accounts…
      </p>
    );
  }
  const money = (n: number) => formatShopCurrency(n, data.currency);
  const waiting = data.accounts.filter((a) => a.status === "pending").length;
  const approved = data.accounts.filter((a) => a.status === "approved").length;

  const decide = async (a: TradeAccountRow, action: TradeAction, text: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendJson(`/api/store/wholesale/${a.accountId}`, "POST", { slug, action, message: text });
      setOpen(null);
      setNote("");
      setMessage(action === "approve" ? "Approved. They've been emailed and can see trade prices when they sign in." : action === "decline" ? "Declined. They've been emailed." : "Their trade account has ended. They've been emailed.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="trade"
        meaning="customers"
        art="people"
        title="Sell to businesses at trade prices"
        points={[
          "Set a trade price (and the smallest quantity it applies from) on each product you want to sell wholesale.",
          "A business applies from its account page. You approve it, and only then does it see trade prices on products and in its basket.",
          "Everyone else sees nothing different. Trade prices are worked out by us at checkout, so they can't be changed from the browser.",
        ]}
      />

      <DashStatStrip label="Trade accounts in figures">
        <DashStatTile label="Waiting for you" meaning="orders" icon={Clock} hint="Applications to approve or decline" value={String(waiting)} />
        <DashStatTile label="Trade customers" meaning="customers" icon={Users} hint="Approved accounts" value={String(approved)} />
      </DashStatStrip>

      <DashAlert message={error} />
      <DashStatus message={message} />
      <SettingsCard slug={slug} settings={data.settings} money={money} onSaved={(settings) => setData({ ...data, settings })} />

      <DashCard id="trade-list" icon={Briefcase} title="Applications and trade customers" description="Waiting applications first.">
        {data.accounts.length === 0 ? (
          <DashEmptyState art="people" meaning="customers" title="No applications yet" description={data.settings.enabled ? "When a business applies from its account page, it appears here." : "Switch on trade accounts above, then customers can apply from their account page."} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...data.accounts].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending")).map((a) => (
              <li key={a.accountId} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-900">{a.business || a.name || a.email}</p>
                    <p className="break-all text-sm text-slate-600">
                      {a.name ? `${a.name} · ` : ""}
                      {a.email}
                      {a.phone ? ` · ${a.phone}` : ""}
                    </p>
                    {a.appliedAt ? <p className="text-sm text-slate-500">Applied {when(a.appliedAt)}</p> : null}
                  </div>
                  <DashPill tone={TONE[a.status]}>{TRADE_STATUS_LABELS[a.status]}</DashPill>
                </div>
                {a.about ? <p className="mt-1 text-sm text-slate-700">“{a.about}”</p> : null}
                {a.message ? <p className="mt-1 text-sm text-slate-600">Your message: {a.message}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {ACTIONS.filter((x) => nextTradeStatus(a.status, x.action)).map((x) => (
                    <button
                      key={x.action}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setOpen({ id: a.accountId, action: x.action });
                        setNote("");
                      }}
                      className={`${x.action === "approve" ? dashButton.primary : x.action === "decline" || x.action === "revoke" ? dashButton.danger : dashButton.secondary} ${focusRing}`}
                    >
                      {x.label}
                      <span className="sr-only"> {a.business || a.email}</span>
                    </button>
                  ))}
                </div>
                {open?.id === a.accountId ? (
                  <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                    <DashField id={`${a.accountId}-note`} label="Message to them (optional)" hint="They're emailed whichever you choose.">
                      <textarea id={`${a.accountId}-note`} className={`${dashInput} min-h-20`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={`${a.accountId}-note-hint`} />
                    </DashField>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => decide(a, open.action, note)} className={`${dashButton.primary} ${focusRing}`}>
                        {busy ? "Saving…" : `Yes, ${open.action === "approve" ? "approve" : open.action === "decline" ? "decline" : "end it"}`}
                      </button>
                      <button type="button" onClick={() => setOpen(null)} className={`${dashButton.secondary} ${focusRing}`}>
                        Not now
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </div>
  );
}

function SettingsCard({ slug, settings, money, onSaved }: { slug: string; settings: WholesaleSettings; money: (n: number) => string; onSaved: (s: WholesaleSettings) => void }) {
  const id = useId();
  const [form, setForm] = useState({ enabled: settings.enabled, minOrder: String(settings.minOrder), allowDiscounts: settings.allowDiscounts });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await sendJson("/api/store/wholesale", "PUT", { slug, ...form });
      onSaved(res.settings);
      setMessage(res.settings.enabled ? "Saved. Customers can now apply for a trade account." : "Saved. Trade accounts are switched off: nobody gets trade prices until you switch them on again.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard id="trade-settings" icon={Briefcase} title="The rules" description="Trade prices are set on each product, in Products, under Pricing.">
      <div className="space-y-4">
        <DashAlert message={error} />
        <DashStatus message={message} />
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="mt-0.5 h-4 w-4 accent-blue-600" />
          <span>
            <span className="font-medium text-slate-800">Offer trade accounts</span>
            <span className="block text-slate-500">Customers can apply from their account page, and approved ones see trade prices.</span>
          </span>
        </label>
        <div className="max-w-sm">
          <DashField id={`${id}-min`} label="Smallest trade order" optional hint={`What the items must come to. 0 for no minimum, for example ${money(50000)}.`}>
            <input id={`${id}-min`} className={dashInput} type="number" inputMode="decimal" min={0} step="any" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} aria-describedby={`${id}-min-hint`} />
          </DashField>
        </div>
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={form.allowDiscounts} onChange={(e) => setForm({ ...form, allowDiscounts: e.target.checked })} className="mt-0.5 h-4 w-4 accent-blue-600" />
          <span>
            <span className="font-medium text-slate-800">Let trade customers also use discount codes</span>
            <span className="block text-slate-500">Off by default, so a code doesn&rsquo;t stack on top of an already lower price.</span>
          </span>
        </label>
        <button type="button" onClick={save} disabled={saving} className={`${dashButton.primary} ${focusRing}`}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </DashCard>
  );
}
