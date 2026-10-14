"use client";

import { useEffect, useId, useState } from "react";
import { Coins, Gift, HandCoins, Heart, Users } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { pointsEarned, pointsValue, type LoyaltySettings } from "@/lib/store/loyalty";
import type { LoyaltyMember } from "@/lib/store/loyalty-server";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashSectionIntro, DashStatStrip, DashStatTile, DashStatus, sendJson } from "./dashboard-ui";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

type Loaded = { settings: LoyaltySettings; members: LoyaltyMember[]; outstanding: number; earned: number; used: number; currency: string };

/** Dashboard → Loyalty points: the rules, who has points, and a way to add or remove them by hand. */
export default function LoyaltyManager({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    fetch(`/api/store/loyalty?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load loyalty points.");
        setData(body);
      })
      .catch(() => setError("We couldn't load loyalty points. Please refresh the page."));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!data) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <p className="text-sm text-slate-600" role="status">
        Loading loyalty points…
      </p>
    );
  }
  const money = (n: number) => formatShopCurrency(n, data.currency);

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="loyalty"
        meaning="marketing"
        art="tag"
        title="Reward customers who come back"
        points={[
          "Customers with an account earn points once an order is paid and delivered, and use them for money off at checkout.",
          "You choose how many points an order earns, what a point is worth, and whether unused points expire.",
          "If an order is cancelled, the points it used go back and the points it earned are taken back.",
        ]}
      />

      <DashStatStrip label="Loyalty points in figures" columns={3}>
        <DashStatTile label="Points held" meaning="customers" icon={Coins} hint={`Worth ${money(pointsValue(data.settings, data.outstanding))} to customers`} value={data.outstanding.toLocaleString("en-GB")} />
        <DashStatTile label="Points earned" meaning="marketing" icon={Heart} hint="All time" value={data.earned.toLocaleString("en-GB")} />
        <DashStatTile label="Points used" meaning="orders" icon={HandCoins} hint={`${money(pointsValue(data.settings, data.used))} off orders`} value={data.used.toLocaleString("en-GB")} />
      </DashStatStrip>

      <DashAlert message={error} />
      <SettingsCard slug={slug} settings={data.settings} money={money} onSaved={(settings) => setData({ ...data, settings })} />
      <AdjustCard slug={slug} onChanged={load} />
      <MembersCard members={data.members} settings={data.settings} />
    </div>
  );
}

function SettingsCard({ slug, settings, money, onSaved }: { slug: string; settings: LoyaltySettings; money: (n: number) => string; onSaved: (s: LoyaltySettings) => void }) {
  const id = useId();
  const [form, setForm] = useState({
    enabled: settings.enabled,
    pointsPer100: String(settings.pointsPer100),
    pointValue: String(settings.pointValue),
    minRedeem: String(settings.minRedeem),
    expiryMonths: String(settings.expiryMonths),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const preview: LoyaltySettings = { ...settings, enabled: true, pointsPer100: Number(form.pointsPer100) || 0, pointValue: Number(form.pointValue) || 0 };
  const earnedOn10k = pointsEarned(preview, 10_000);
  const backPercent = preview.pointsPer100 > 0 ? Math.round((earnedOn10k * preview.pointValue) / 100) : 0;

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = { slug, ...form };
      const res = await sendJson("/api/store/loyalty", "PUT", body);
      onSaved(res.settings);
      setMessage(res.settings.enabled ? "Saved. Customers with an account now earn points." : "Saved. Loyalty points are switched off: nobody earns or uses points, and balances are kept.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard id="loyalty-settings" icon={Gift} title="How points work" description="Customers only earn points when they have an account, which checkout makes for them.">
      <div className="space-y-4">
        <DashAlert message={error} />
        <DashStatus message={message} />
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="mt-0.5 h-4 w-4 accent-blue-600" />
          <span>
            <span className="font-medium text-slate-800">Reward customers with points</span>
            <span className="block text-slate-500">Switch this off at any time. Balances are kept.</span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <DashField id={`${id}-per`} label="Points for every 100 spent" hint="On the items, after any discount. Not on delivery or tax.">
            <input id={`${id}-per`} className={dashInput} type="number" inputMode="decimal" min={0} step="any" value={form.pointsPer100} onChange={(e) => setForm({ ...form, pointsPer100: e.target.value })} aria-describedby={`${id}-per-hint`} />
          </DashField>
          <DashField id={`${id}-value`} label="What one point is worth" hint="In your shop's currency, taken off at checkout.">
            <input id={`${id}-value`} className={dashInput} type="number" inputMode="decimal" min={0} step="any" value={form.pointValue} onChange={(e) => setForm({ ...form, pointValue: e.target.value })} aria-describedby={`${id}-value-hint`} />
          </DashField>
          <DashField id={`${id}-min`} label="Fewest points to use at once" optional hint="0 means no minimum.">
            <input id={`${id}-min`} className={dashInput} type="number" inputMode="numeric" min={0} step={1} value={form.minRedeem} onChange={(e) => setForm({ ...form, minRedeem: e.target.value })} aria-describedby={`${id}-min-hint`} />
          </DashField>
          <DashField id={`${id}-exp`} label="Points expire after (months)" optional hint="Months with no points earned or used. 0 means they never expire.">
            <input id={`${id}-exp`} className={dashInput} type="number" inputMode="numeric" min={0} step={1} value={form.expiryMonths} onChange={(e) => setForm({ ...form, expiryMonths: e.target.value })} aria-describedby={`${id}-exp-hint`} />
          </DashField>
        </div>
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800">
          With these settings, a {money(10_000)} order earns {earnedOn10k.toLocaleString("en-GB")} points, worth {money(pointsValue(preview, earnedOn10k))} off a later order. That is about {backPercent}% back.
        </p>
        <button type="button" onClick={save} disabled={saving} className={`${dashButton.primary} ${focusRing}`}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </DashCard>
  );
}

function AdjustCard({ slug, onChanged }: { slug: string; onChanged: () => Promise<void> }) {
  const id = useId();
  const [form, setForm] = useState({ email: "", points: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await sendJson("/api/store/loyalty/adjust", "POST", { slug, ...form });
      setMessage(`Done. They now have ${Number(res.balance).toLocaleString("en-GB")} points.`);
      setForm({ email: "", points: "", note: "" });
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard id="loyalty-adjust" icon={Users} title="Add or remove points" description="A thank-you, or putting something right. Use a minus sign to take points away. Every change is recorded with your reason.">
      <form className="space-y-4" onSubmit={submit} noValidate>
        <DashAlert message={error} />
        <DashStatus message={message} />
        <div className="grid gap-4 sm:grid-cols-3">
          <DashField id={`${id}-email`} label="Customer's email">
            <input id={`${id}-email`} className={dashInput} type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </DashField>
          <DashField id={`${id}-points`} label="Points" hint="For example 200, or -50.">
            <input id={`${id}-points`} className={dashInput} type="number" inputMode="numeric" step={1} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} aria-describedby={`${id}-points-hint`} />
          </DashField>
          <DashField id={`${id}-note`} label="Reason">
            <input id={`${id}-note`} className={dashInput} maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </DashField>
        </div>
        <button type="submit" disabled={saving} className={`${dashButton.secondary} ${focusRing}`}>
          {saving ? "Saving…" : "Change points"}
        </button>
      </form>
    </DashCard>
  );
}

function MembersCard({ members, settings }: { members: LoyaltyMember[]; settings: LoyaltySettings }) {
  return (
    <DashCard id="loyalty-members" icon={Heart} title="Who has points" description="Customers with points activity, biggest balance first.">
      {members.length === 0 ? (
        <DashEmptyState
          art="people"
          meaning="marketing"
          title="No points yet"
          description={settings.enabled ? "Points appear here after a customer's order is paid and delivered." : "Switch on loyalty points above, and customers start earning them on their next order."}
        />
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <caption className="sr-only">Customers and their points</caption>
            <thead className="border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th scope="col" className="py-3 pr-4 font-semibold">Customer</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">Balance</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">Earned</th>
                <th scope="col" className="py-3 text-right font-semibold">Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.accountId}>
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <span className="block font-medium text-slate-900">{m.name || m.email}</span>
                    {m.name ? <span className="block break-all text-xs text-slate-500">{m.email}</span> : null}
                  </th>
                  <td className="py-3 pr-4 text-right font-medium text-slate-900">{m.balance.toLocaleString("en-GB")}</td>
                  <td className="py-3 pr-4 text-right text-slate-700">{m.earned.toLocaleString("en-GB")}</td>
                  <td className="py-3 text-right text-slate-700">{m.used.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}
