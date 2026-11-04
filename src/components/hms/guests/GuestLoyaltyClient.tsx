"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, Plus, Trophy, X } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { LoyaltyOverview } from "@/lib/hms/guest-loyalty";
import type { LoyaltySettings } from "@/lib/hms/guest-loyalty-shared";

export function GuestLoyaltyClient({
  slug,
  settings,
  overview,
  canManage,
  currency,
}: {
  slug: string;
  settings: LoyaltySettings;
  overview: LoyaltyOverview;
  canManage: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [spendPerPoint, setSpendPerPoint] = useState(String(settings.spendPerPoint));
  const [pointValue, setPointValue] = useState(String(settings.pointValue));
  const [earnFrom, setEarnFrom] = useState(settings.earnFrom ?? "");
  const [tiers, setTiers] = useState(settings.tiers.map((t) => ({ ...t, minPoints: String(t.minPoints) })));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/guests/loyalty/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          enabled,
          spendPerPoint: Number(spendPerPoint),
          pointValue: Number(pointValue) || 0,
          earnFrom: earnFrom || null,
          tiers: tiers.map((t) => ({ name: t.name, minPoints: Math.max(0, Math.floor(Number(t.minPoints) || 0)), perks: t.perks })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError("Could not save", data.error ?? "Check the numbers and try again.");
      toastSuccess("Loyalty settings saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/hotel/guests/loyalty/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError("Could not credit points", data.error ?? "Try again.");
      toastSuccess(data.credited ? `${data.credited} stays credited` : "Everything is already credited");
      router.refresh();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <HmsPage wide>
      <GuestsNav slug={slug} />
      <HmsPageHeader
        eyebrow="Guests"
        meaning="guests"
        title="Loyalty"
        description="Guests earn points on what they spend, and reach tiers as their points grow."
        actions={
          canManage && settings.enabled ? (
            <button type="button" className={hmsButton.secondary} onClick={sync} disabled={syncing}>
              {syncing ? "Crediting…" : "Credit points for finished stays"}
            </button>
          ) : undefined
        }
      />

      {settings.enabled ? (
        <HmsStatStrip label="Loyalty in figures" columns={3}>
          <HmsStatTile label="Members" value={overview.members} icon={Gift} meaning="guests" hint="Guests who have earned points" />
          <HmsStatTile label="Points owed" value={overview.outstandingPoints.toLocaleString("en-NG")} icon={Trophy} meaning="money" hint={settings.pointValue > 0 ? `Worth ${formatPricingAmount(overview.outstandingPoints * settings.pointValue, currency)}` : "Points guests can still spend"} />
          <HmsStatTile label="Tiers" value={overview.tierCounts.filter((t) => t.count > 0).map((t) => `${t.name} ${t.count}`).join(" · ") || "—"} icon={Gift} meaning="guests" hint="Members in each tier" />
        </HmsStatStrip>
      ) : null}

      <HmsCard id="loyalty-settings" icon={Gift} meaning="guests" title="How it works" description={canManage ? undefined : "Only a manager can change these."}>
        <form onSubmit={save} className="space-y-5" aria-label="Loyalty settings">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <input type="checkbox" className="h-4 w-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canManage} />
            Loyalty is on
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <HmsField id="loy-spend" label="Spend that earns one point" hint="For example 1000 means one point for every 1,000 billed.">
              <input id="loy-spend" type="number" min={1} step="any" className={hmsInput} value={spendPerPoint} onChange={(e) => setSpendPerPoint(e.target.value)} disabled={!canManage} />
            </HmsField>
            <HmsField id="loy-value" label="What one point is worth" hint="When a guest spends points on their bill.">
              <input id="loy-value" type="number" min={0} step="any" className={hmsInput} value={pointValue} onChange={(e) => setPointValue(e.target.value)} disabled={!canManage} />
            </HmsField>
            <HmsField id="loy-from" label="Count stays from" optional hint="Earlier stays earn nothing. Leave empty to count every finished stay.">
              <input id="loy-from" type="date" className={hmsInput} value={earnFrom} onChange={(e) => setEarnFrom(e.target.value)} disabled={!canManage} />
            </HmsField>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-900">Tiers</legend>
            <p className="mb-3 text-sm text-slate-600">A guest reaches a tier by the points they have earned in all. Spending points never lowers their tier.</p>
            <ul className="space-y-3">
              {tiers.map((t, i) => (
                <li key={i} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <label htmlFor={`tier-name-${i}`} className="mb-1 block text-sm font-medium text-slate-800">Name</label>
                    <input id={`tier-name-${i}`} className={hmsInput} value={t.name} onChange={(e) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} disabled={!canManage} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`tier-min-${i}`} className="mb-1 block text-sm font-medium text-slate-800">From points</label>
                    <input id={`tier-min-${i}`} type="number" min={0} className={hmsInput} value={t.minPoints} onChange={(e) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, minPoints: e.target.value } : x)))} disabled={!canManage} />
                  </div>
                  <div className="sm:col-span-6">
                    <label htmlFor={`tier-perks-${i}`} className="mb-1 block text-sm font-medium text-slate-800">What they get</label>
                    <input id={`tier-perks-${i}`} className={hmsInput} value={t.perks} onChange={(e) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, perks: e.target.value } : x)))} placeholder="Late check-out, free breakfast…" disabled={!canManage} />
                  </div>
                  {canManage && tiers.length > 1 ? (
                    <div className="flex items-end sm:col-span-1">
                      <button type="button" className={hmsButton.danger} onClick={() => setTiers((p) => p.filter((_, j) => j !== i))} aria-label={`Remove tier ${t.name || i + 1}`}>
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {canManage && tiers.length < 8 ? (
              <button type="button" className={`${hmsButton.small} mt-3`} onClick={() => setTiers((p) => [...p, { name: "", minPoints: "", perks: "" }])}>
                <Plus className="h-4 w-4" aria-hidden />
                Add a tier
              </button>
            ) : null}
          </fieldset>

          {canManage ? (
            <div className="flex justify-end">
              <button type="submit" className={hmsButton.primary} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          ) : null}
        </form>
      </HmsCard>

      {settings.enabled ? (
        <HmsCard id="loyalty-top" icon={Trophy} meaning="guests" title="Top members" flush>
          {overview.top.length === 0 ? (
            <p className="px-6 py-5 text-sm text-slate-600">Nobody has earned points yet. Points are credited when a stay is checked out.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <caption className="sr-only">Guests with the most points</caption>
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th scope="col" className="py-3 pl-6 pr-4 font-semibold">Guest</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Tier</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Earned in all</th>
                    <th scope="col" className="py-3 pr-6 text-right font-semibold">To spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.top.map((t) => (
                    <tr key={t.guestId}>
                      <td className="py-3 pl-6 pr-4">
                        <Link href={`/hms/${slug}/guests/${t.guestId}`} className="font-medium text-blue-700 hover:underline">
                          {t.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{t.tier ? <HmsPill tone="amber">{t.tier}</HmsPill> : "—"}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{t.lifetime.toLocaleString("en-NG")}</td>
                      <td className="py-3 pr-6 text-right tabular-nums">{t.balance.toLocaleString("en-NG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HmsCard>
      ) : null}
    </HmsPage>
  );
}
