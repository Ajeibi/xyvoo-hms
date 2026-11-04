"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsCard, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import type { GuestLoyalty, LoyaltySettings } from "@/lib/hms/guest-loyalty-shared";

const KIND: Record<string, string> = { earn: "Earned", redeem: "Spent", adjust: "Adjusted" };

/** A guest's points, tier and the record of every movement. Managers can spend points or correct the balance. */
export function GuestLoyaltyCard({
  slug,
  guestId,
  settings,
  loyalty,
  canManage,
  currencyLabel,
}: {
  slug: string;
  guestId: string;
  settings: LoyaltySettings;
  loyalty: GuestLoyalty;
  canManage: boolean;
  /** How much one point is worth, already formatted, like "₦1". */
  currencyLabel: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"redeem" | "adjust">("redeem");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(points);
    if (!Number.isFinite(n) || n === 0) return toastError("Enter a number of points");
    setSaving(true);
    try {
      const res = await fetch(`/api/hotel/guests/${guestId}/loyalty`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, kind, points: n, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError("Could not save", data.error ?? "Try again.");
      toastSuccess(kind === "redeem" ? "Points spent" : "Balance adjusted");
      setPoints("");
      setNote("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <HmsCard id="guest-loyalty" icon={Gift} meaning="guests" title="Loyalty" description={settings.enabled ? undefined : "Loyalty is switched off. A manager can turn it on under Loyalty."}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-slate-600">Points to spend</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{loyalty.balance.toLocaleString("en-NG")}</p>
        </div>
        <div>
          <p className="text-xs text-slate-600">Tier</p>
          <p className="text-lg font-semibold text-slate-900">{loyalty.tier ? <HmsPill tone="amber">{loyalty.tier.name}</HmsPill> : "None yet"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-600">Earned in all</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{loyalty.lifetime.toLocaleString("en-NG")}</p>
        </div>
        {settings.pointValue > 0 ? (
          <p className="text-sm text-slate-600">Each point is worth {currencyLabel}.</p>
        ) : null}
      </div>
      {loyalty.nextTier && loyalty.pointsToNextTier != null ? (
        <p className="mt-2 text-sm text-slate-700">
          {loyalty.pointsToNextTier.toLocaleString("en-NG")} more points to reach {loyalty.nextTier.name}.
        </p>
      ) : null}
      {loyalty.tier?.perks ? <p className="mt-1 text-sm text-slate-700">Perks: {loyalty.tier.perks}</p> : null}

      {canManage && settings.enabled ? (
        <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-6" aria-label="Spend or adjust points">
          <div className="sm:col-span-2">
            <label htmlFor="loy-kind" className="mb-1 block text-sm font-medium text-slate-800">What to do</label>
            <select id="loy-kind" className={hmsInput} value={kind} onChange={(e) => setKind(e.target.value as "redeem" | "adjust")}>
              <option value="redeem">Spend points</option>
              <option value="adjust">Add or take off points</option>
            </select>
          </div>
          <div className="sm:col-span-1">
            <label htmlFor="loy-points" className="mb-1 block text-sm font-medium text-slate-800">Points</label>
            <input id="loy-points" type="number" step="1" className={hmsInput} value={points} onChange={(e) => setPoints(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="loy-note" className="mb-1 block text-sm font-medium text-slate-800">Why</label>
            <input id="loy-note" className={hmsInput} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Free night, bill discount, goodwill…" />
          </div>
          <div className="sm:col-span-6 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              {kind === "redeem" ? "Enter how many points the guest is spending." : "Use a minus sign to take points off."}
            </p>
            <button type="submit" className={hmsButton.primary} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : null}

      {loyalty.ledger.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">Points history</caption>
            <thead className="text-slate-700">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">When</th>
                <th scope="col" className="py-2 pr-4 font-semibold">What</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Note</th>
                <th scope="col" className="py-2 text-right font-semibold">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loyalty.ledger.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap py-2 pr-4 text-slate-700">{formatBoardDateTime(l.createdAt)}</td>
                  <td className="py-2 pr-4 text-slate-700">{KIND[l.kind]}</td>
                  <td className="py-2 pr-4 text-slate-700">
                    {l.confirmationCode ? `Stay ${l.confirmationCode}` : l.note}
                    {l.createdByName && l.kind !== "earn" ? ` · ${l.createdByName}` : ""}
                  </td>
                  <td className={`py-2 text-right tabular-nums font-medium ${l.points < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {l.points > 0 ? "+" : ""}
                    {l.points.toLocaleString("en-NG")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : settings.enabled ? (
        <p className="mt-4 text-sm text-slate-600">No points yet. They are credited after a stay is checked out.</p>
      ) : null}
    </HmsCard>
  );
}
