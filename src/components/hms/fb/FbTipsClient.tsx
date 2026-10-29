"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HandCoins, Loader2 } from "lucide-react";
import {
  type FbTipBalance,
  type FbTipPayoutMethod,
  payoutBlockReason,
  poolShares,
} from "@/lib/hms/fb-tip-rules";
import type { FbTipEntry, FbTipPayoutEntry, FbTipStaff } from "@/lib/hms/fb-tips";
import { roundMoney } from "@/lib/hms/fb-payment-rules";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsAlert, HmsEmptyState, HmsField, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { cn } from "@/lib/utils";

type TipsData = {
  staff: FbTipStaff[];
  balances: FbTipBalance[];
  recentTips: FbTipEntry[];
  recentPayouts: FbTipPayoutEntry[];
  canPayOut: boolean;
  userId: string;
};

/** Paying one person's own tips, or sharing out the pool. */
type Payout =
  | { source: "own"; staffId: string; amount: string }
  | { source: "pool"; total: string; chosen: string[]; amounts: Record<string, string> };

const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", pos: "Card machine" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

async function fetchTips(slug: string): Promise<{ data: TipsData } | { error: string }> {
  try {
    const res = await fetch(`/api/hotel/fb/tips?slug=${encodeURIComponent(slug)}`);
    const json = await res.json();
    return res.ok ? { data: json } : { error: json.error ?? "Could not load tips." };
  } catch {
    return { error: "Could not load tips. Check your connection." };
  }
}

/** Tips owed to staff and the shared pool, recent tips, and paying them out. */
export function FbTipsClient({ slug, currency }: { slug: string; currency: string }) {
  const [data, setData] = useState<TipsData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [payout, setPayout] = useState<Payout | null>(null);
  const [method, setMethod] = useState<FbTipPayoutMethod>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const money = (n: number) => formatPricingAmount(n, currency);

  // Bumped after a payout to load the figures again.
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    fetchTips(slug).then((result) => {
      if (!live) return;
      if ("error" in result) {
        setLoadError(result.error);
        return;
      }
      setData(result.data);
      setLoadError("");
    });
    return () => {
      live = false;
    };
  }, [slug, version]);

  const nameOf = useMemo(() => {
    const names = new Map((data?.staff ?? []).map((s) => [s.userId, s.name]));
    return (id: string | null) => (id === null ? "Shared tip pool" : (names.get(id) ?? "Former staff"));
  }, [data?.staff]);

  const pool = data?.balances.find((b) => b.staffId === null);
  const people = (data?.balances ?? []).filter((b) => b.staffId !== null);
  const totalOwed = roundMoney((data?.balances ?? []).reduce((s, b) => s + Math.max(0, b.owed), 0));

  const startOwn = (b: FbTipBalance) => {
    setPayout({ source: "own", staffId: b.staffId ?? "", amount: String(b.owed) });
    setMethod("cash");
    setNote("");
    setError("");
  };
  const startPool = () => {
    setPayout({ source: "pool", total: String(pool?.owed ?? 0), chosen: [], amounts: {} });
    setMethod("cash");
    setNote("");
    setError("");
  };

  /** Re-shares the pool total equally between the people ticked. */
  const reshare = (total: string, chosen: string[]) => {
    const amounts: Record<string, string> = {};
    for (const s of poolShares(Number(total) || 0, chosen)) amounts[s.staffId] = String(s.amount);
    return amounts;
  };

  const payments =
    payout?.source === "own"
      ? [{ staffId: payout.staffId, amount: Number(payout.amount) }]
      : payout
        ? payout.chosen.map((id) => ({ staffId: id, amount: Number(payout.amounts[id] ?? 0) }))
        : [];
  const owedNow =
    payout?.source === "own" ? (data?.balances.find((b) => b.staffId === payout.staffId)?.owed ?? 0) : (pool?.owed ?? 0);
  const blocked = payout ? payoutBlockReason({ owed: owedNow, amounts: payments.map((p) => p.amount) }) : null;
  const payTotal = roundMoney(payments.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0));

  const submit = async () => {
    if (!payout) return;
    if (blocked) {
      setError(blocked);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/hotel/fb/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, source: payout.source, payments, method, note: note.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save. Try again.");
        return;
      }
      toastSuccess("Tips paid out", `${money(json.total)} by ${method === "cash" ? "cash" : "bank transfer"}`);
      setPayout(null);
      load();
    } catch {
      toastError("Could not save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6">
      <HmsPageHeader
        eyebrow="Restaurant & bar"
        meaning="food"
        title="Tips"
        description={
          data?.canPayOut
            ? "Tips taken with payments, what each person is owed, and what has been handed over. Tips are never part of the bill."
            : "Your tips and the shared pool. A manager records it when tips are handed over."
        }
      />

      {loadError ? <HmsAlert message={loadError} /> : null}
      {!data && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading tips…
        </p>
      ) : null}

      {data && !data.balances.length ? (
        <HmsEmptyState
          art="box"
          meaning="food"
          title="No tips yet"
          description="Add a tip when taking a payment in Open orders. It shows here, owed to the person who served or to the shared pool."
        />
      ) : null}

      {data && data.balances.length ? (
        <section aria-labelledby="fb-tips-owed" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="fb-tips-owed" className="font-heading text-base font-semibold text-slate-900">
              Owed now
            </h2>
            {data.canPayOut ? <p className="text-sm text-slate-700">Total owed: <span className="font-semibold tabular-nums">{money(totalOwed)}</span></p> : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th scope="col" className="py-2 pr-3 font-medium">Who</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Tips</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">In cash</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Paid out</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Owed</th>
                  {data.canPayOut ? <th scope="col" className="py-2"><span className="sr-only">Pay out</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {[...(pool ? [pool] : []), ...people].map((b) => (
                  <tr key={b.staffId ?? "pool"} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className={cn("py-2 pr-3 text-left font-medium", b.staffId === null ? "text-violet-900" : "text-slate-900")}>
                      {nameOf(b.staffId)}
                      {b.staffId === data.userId ? <span className="font-normal text-slate-600"> (you)</span> : null}
                    </th>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(b.earned)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{money(b.earnedCash)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(b.paid)}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{money(b.owed)}</td>
                    {data.canPayOut ? (
                      <td className="py-2 text-right">
                        {b.owed > 0 ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => (b.staffId === null ? startPool() : startOwn(b))}
                            className={hmsButton.small}
                          >
                            {b.staffId === null ? "Share out" : "Pay out"}
                            <span className="sr-only"> {nameOf(b.staffId)}</span>
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            &ldquo;In cash&rdquo; tips are already in the till. Card machine tips reach the hotel&rsquo;s bank and are paid out from there.
          </p>
        </section>
      ) : null}

      {payout && data ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          aria-label={payout.source === "pool" ? "Share out the tip pool" : `Pay out tips to ${nameOf(payout.staffId)}`}
          className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm"
        >
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-900">
            <HandCoins className="h-5 w-5 text-emerald-700" aria-hidden />
            {payout.source === "pool" ? "Share out the tip pool" : `Pay out tips to ${nameOf(payout.staffId)}`}
            <span className="text-sm font-normal text-slate-600">· {money(owedNow)} owed</span>
          </h2>

          {payout.source === "own" ? (
            <div className="max-w-xs">
              <HmsField id="fb-tips-amount" label="Amount handed over">
                <input
                  id="fb-tips-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={payout.amount}
                  onChange={(e) => setPayout({ ...payout, amount: e.target.value })}
                  className={hmsInput}
                />
              </HmsField>
            </div>
          ) : (
            <>
              <div className="max-w-xs">
                <HmsField id="fb-tips-pool-total" label="Amount to share" hint="Shared equally between the people ticked; adjust each share below if needed.">
                  <input
                    id="fb-tips-pool-total"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={payout.total}
                    onChange={(e) =>
                      setPayout({ ...payout, total: e.target.value, amounts: reshare(e.target.value, payout.chosen) })
                    }
                    aria-describedby="fb-tips-pool-total-hint"
                    className={hmsInput}
                  />
                </HmsField>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-800">Who gets a share</legend>
                <ul className="space-y-2">
                  {data.staff.map((s) => {
                    const on = payout.chosen.includes(s.userId);
                    return (
                      <li key={s.userId} className="flex flex-wrap items-center gap-3">
                        <label className="flex min-w-48 items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => {
                              const chosen = e.target.checked
                                ? [...payout.chosen, s.userId]
                                : payout.chosen.filter((id) => id !== s.userId);
                              setPayout({ ...payout, chosen, amounts: reshare(payout.total, chosen) });
                            }}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {s.name}
                        </label>
                        {on ? (
                          <>
                            <label htmlFor={`fb-tips-share-${s.userId}`} className="sr-only">
                              Share for {s.name}
                            </label>
                            <input
                              id={`fb-tips-share-${s.userId}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              value={payout.amounts[s.userId] ?? ""}
                              onChange={(e) =>
                                setPayout({ ...payout, amounts: { ...payout.amounts, [s.userId]: e.target.value } })
                              }
                              className={cn(hmsInput, "max-w-36")}
                            />
                          </>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            </>
          )}

          <div role="group" aria-label="Paid by" className="flex max-w-sm gap-2">
            {(
              [
                ["cash", "Cash"],
                ["bank", "Bank transfer"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={method === value}
                onClick={() => setMethod(value)}
                className={cn(
                  "min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  method === value ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-w-md">
            <HmsField id="fb-tips-note" label="Note" optional>
              <input
                id="fb-tips-note"
                value={note}
                maxLength={200}
                placeholder="e.g. Friday night shift"
                onChange={(e) => setNote(e.target.value)}
                className={hmsInput}
              />
            </HmsField>
          </div>

          <HmsAlert message={error || (payments.length && blocked ? blocked : "")} />

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving || Boolean(blocked)} className={hmsButton.primary}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Record {money(payTotal)} paid out
            </button>
            <button type="button" disabled={saving} onClick={() => setPayout(null)} className={hmsButton.secondary}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {data && data.recentTips.length ? (
        <section aria-labelledby="fb-tips-recent" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 id="fb-tips-recent" className="font-heading text-base font-semibold text-slate-900">
            Recent tips
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th scope="col" className="py-2 pr-3 font-medium">When</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Bill</th>
                  <th scope="col" className="py-2 pr-3 font-medium">For</th>
                  <th scope="col" className="py-2 pr-3 font-medium">How</th>
                  <th scope="col" className="py-2 text-right font-medium">Tip</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTips.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 text-slate-700">{when(t.createdAt)}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">#{t.orderNumber}</td>
                    <td className="py-2 pr-3">{nameOf(t.staffId)}</td>
                    <td className="py-2 pr-3 text-slate-700">{METHOD_LABEL[t.method] ?? t.method}</td>
                    <td className="py-2 text-right tabular-nums">{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data && data.recentPayouts.length ? (
        <section aria-labelledby="fb-tips-payouts" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 id="fb-tips-payouts" className="font-heading text-base font-semibold text-slate-900">
            Paid out
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th scope="col" className="py-2 pr-3 font-medium">When</th>
                  <th scope="col" className="py-2 pr-3 font-medium">To</th>
                  <th scope="col" className="py-2 pr-3 font-medium">From</th>
                  <th scope="col" className="py-2 pr-3 font-medium">How</th>
                  <th scope="col" className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayouts.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 text-slate-700">{when(p.createdAt)}</td>
                    <td className="py-2 pr-3">
                      {nameOf(p.staffId)}
                      {p.note ? <span className="block text-xs text-slate-600">{p.note}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{p.source === "pool" ? "Tip pool" : "Own tips"}</td>
                    <td className="py-2 pr-3 text-slate-700">{p.method === "cash" ? "Cash" : "Bank transfer"}</td>
                    <td className="py-2 text-right tabular-nums">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
