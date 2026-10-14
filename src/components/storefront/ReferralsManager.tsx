"use client";

import { useEffect, useId, useState } from "react";
import { Gift, HandCoins, Share2, Users } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { friendOfferText, rewardText, type ReferralSettings } from "@/lib/store/referrals";
import type { ReferralRow } from "@/lib/store/referrals-server";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashSectionIntro, DashStatStrip, DashStatTile, DashStatus, sendJson } from "./dashboard-ui";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

type Loaded = { settings: ReferralSettings; rows: ReferralRow[]; total: number; points: number; giftCards: number; loyaltyOn: boolean; currency: string };

/** Dashboard → Referrals: what a friend gets, what the customer who shared gets, and who has been rewarded. */
export default function ReferralsManager({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/store/referrals?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load referrals.");
        setData(body);
      })
      .catch(() => setError("We couldn't load referrals. Please refresh the page."));
  }, [slug]);

  if (!data) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <p className="text-sm text-slate-600" role="status">
        Loading referrals…
      </p>
    );
  }
  const money = (n: number) => formatShopCurrency(n, data.currency);

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="referrals"
        meaning="marketing"
        art="people"
        title="Let your best customers bring you new ones"
        points={[
          "Each customer with an account gets a personal friend code on their account page. Their friend types it at checkout for money off a first order.",
          "When the friend's order has been paid and delivered, the customer who shared the code is rewarded with loyalty points or a gift card.",
          "Ordering with your own details never earns a reward, and each customer can earn only so many a month.",
        ]}
      />

      <DashStatStrip label="Referrals in figures" columns={3}>
        <DashStatTile label="Friends brought in" meaning="customers" icon={Users} hint="First orders that earned a reward" value={String(data.total)} />
        <DashStatTile label="Points given" meaning="marketing" icon={HandCoins} hint="As referral rewards" value={data.points.toLocaleString("en-GB")} />
        <DashStatTile label="Gift cards given" meaning="money" icon={Gift} hint="As referral rewards" value={money(data.giftCards)} />
      </DashStatStrip>

      <DashAlert message={error} />
      <SettingsCard slug={slug} settings={data.settings} loyaltyOn={data.loyaltyOn} money={money} onSaved={(settings) => setData({ ...data, settings })} />
      <RewardsCard rows={data.rows} money={money} />
    </div>
  );
}

function SettingsCard({ slug, settings, loyaltyOn, money, onSaved }: { slug: string; settings: ReferralSettings; loyaltyOn: boolean; money: (n: number) => string; onSaved: (s: ReferralSettings) => void }) {
  const id = useId();
  const [form, setForm] = useState({
    enabled: settings.enabled,
    friendKind: settings.friendKind,
    friendValue: String(settings.friendValue),
    minOrder: String(settings.minOrder),
    rewardKind: settings.rewardKind,
    rewardValue: String(settings.rewardValue),
    maxPerMonth: String(settings.maxPerMonth),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const preview: ReferralSettings = { ...settings, friendKind: form.friendKind, friendValue: Number(form.friendValue) || 0, minOrder: Number(form.minOrder) || 0, rewardKind: form.rewardKind, rewardValue: Number(form.rewardValue) || 0 };

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await sendJson("/api/store/referrals", "PUT", { slug, ...form });
      onSaved(res.settings);
      setMessage(res.settings.enabled ? "Saved. Customers with an account can now share their friend code." : "Saved. Referrals are switched off, and friend codes stop working.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard id="referral-settings" icon={Share2} title="The offer" description="Changes apply to every friend code straight away.">
      <div className="space-y-4">
        <DashAlert message={error} />
        <DashStatus message={message} />
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="mt-0.5 h-4 w-4 accent-blue-600" />
          <span>
            <span className="font-medium text-slate-800">Let customers refer friends</span>
            <span className="block text-slate-500">Customers see their friend code on their account page once they have confirmed their email.</span>
          </span>
        </label>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">What the friend gets</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <DashField id={`${id}-fkind`} label="Kind of offer">
              <select id={`${id}-fkind`} className={dashInput} value={form.friendKind} onChange={(e) => setForm({ ...form, friendKind: e.target.value as "percent" | "fixed" })}>
                <option value="percent">A percentage off</option>
                <option value="fixed">An amount off</option>
              </select>
            </DashField>
            <DashField id={`${id}-fvalue`} label={form.friendKind === "percent" ? "Percentage off" : "Amount off"}>
              <input id={`${id}-fvalue`} className={dashInput} type="number" inputMode="decimal" min={0} step="any" value={form.friendValue} onChange={(e) => setForm({ ...form, friendValue: e.target.value })} />
            </DashField>
            <DashField id={`${id}-min`} label="Smallest order" optional hint="The least they spend on items. 0 for none.">
              <input id={`${id}-min`} className={dashInput} type="number" inputMode="decimal" min={0} step="any" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} aria-describedby={`${id}-min-hint`} />
            </DashField>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">What the customer who shared it gets</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <DashField id={`${id}-rkind`} label="Reward">
              <select id={`${id}-rkind`} className={dashInput} value={form.rewardKind} onChange={(e) => setForm({ ...form, rewardKind: e.target.value as "points" | "gift_card" })}>
                <option value="points">Loyalty points</option>
                <option value="gift_card">A gift card</option>
              </select>
            </DashField>
            <DashField id={`${id}-rvalue`} label={form.rewardKind === "points" ? "Points" : "Gift card amount"}>
              <input id={`${id}-rvalue`} className={dashInput} type="number" inputMode="decimal" min={0} step="any" value={form.rewardValue} onChange={(e) => setForm({ ...form, rewardValue: e.target.value })} />
            </DashField>
            <DashField id={`${id}-cap`} label="Most rewards a month" hint="For each customer.">
              <input id={`${id}-cap`} className={dashInput} type="number" inputMode="numeric" min={0} step={1} value={form.maxPerMonth} onChange={(e) => setForm({ ...form, maxPerMonth: e.target.value })} aria-describedby={`${id}-cap-hint`} />
            </DashField>
          </div>
          {form.rewardKind === "points" && !loyaltyOn ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Loyalty points are switched off at the moment. Points are still given and kept, but customers can&rsquo;t spend them until you switch loyalty points on.
            </p>
          ) : null}
        </fieldset>

        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800">
          Your friend gets {friendOfferText(preview, money)}. The customer who shared the code gets {rewardText(preview, money)} once that order has been paid and delivered.
        </p>
        <button type="button" onClick={save} disabled={saving} className={`${dashButton.primary} ${focusRing}`}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </DashCard>
  );
}

function RewardsCard({ rows, money }: { rows: ReferralRow[]; money: (n: number) => string }) {
  return (
    <DashCard id="referral-rewards" icon={Users} title="Rewards given" description="Newest first.">
      {rows.length === 0 ? (
        <DashEmptyState art="people" meaning="marketing" title="No rewards yet" description="They appear here after a friend's first order has been paid and delivered." />
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Referral rewards given</caption>
            <thead className="border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th scope="col" className="py-3 pr-4 font-semibold">Shared by</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Friend</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Order</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Reward</th>
                <th scope="col" className="py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="py-3 pr-4 font-medium text-slate-900">{r.referrer}</th>
                  <td className="py-3 pr-4 break-all text-slate-700">{r.friendEmail || "—"}</td>
                  <td className="py-3 pr-4 text-slate-700">{r.orderRef}</td>
                  <td className="py-3 pr-4 text-slate-700">{r.kind === "points" ? `${r.value.toLocaleString("en-GB")} points` : `${money(r.value)} gift card`}</td>
                  <td className="py-3 text-slate-700">{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}
