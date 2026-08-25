"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import type { NightAuditBreakdown, NightAuditRunRow } from "@/lib/hms/night-audit";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number) {
  return n.toFixed(2);
}

function StatCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", warn && value !== 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", warn && value !== 0 ? "text-amber-800" : "text-slate-900")}>{fmt(value)}</p>
    </div>
  );
}

export function AccountsNightAuditClient({
  slug,
  runs,
  canRun,
  canAccessAllDepartments,
}: {
  slug: string;
  runs: NightAuditRunRow[];
  canRun: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(yesterday);
  const [breakdown, setBreakdown] = useState<NightAuditBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBreakdown(null);
    fetch(`/api/hotel/accounts/night-audit?${new URLSearchParams({ slug, date })}`)
      .then((res) => res.json())
      .then((json: { breakdown?: NightAuditBreakdown; error?: string }) => {
        if (!cancelled && !json.error) setBreakdown(json.breakdown ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, date]);

  const alreadyRun = runs.some((r) => r.auditDate === date);

  const runAudit = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/hotel/accounts/night-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, date }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not run night audit", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Night audit posted for ${date}.`);
      router.refresh();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Night audit</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Summarizes a day&apos;s guest folio activity and walk-in F&amp;B sales into one balanced posting to the ledger.
      </p>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Audit date</p>
            <Input type="date" className="w-48" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {canRun ? (
            <Button type="button" disabled={running || loading || alreadyRun} onClick={() => void runAudit()}>
              {running ? "Posting…" : alreadyRun ? "Already audited" : "Run night audit"}
            </Button>
          ) : null}
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        ) : breakdown ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Room revenue" value={breakdown.roomRevenue} />
              <StatCard label="F&B revenue" value={breakdown.fbRevenue} />
              <StatCard label="Other dept. revenue" value={breakdown.otherRevenue} />
              <StatCard label="Unclassified revenue" value={breakdown.unclassifiedRevenue} warn />
              <StatCard label="Cash" value={breakdown.cashTotal} />
              <StatCard label="Card / POS" value={breakdown.cardTotal} />
              <StatCard label="City ledger" value={breakdown.cityLedgerTotal} />
              <StatCard label="Guest ledger movement" value={breakdown.guestLedgerNet} />
            </div>
            {breakdown.unclassifiedRevenue !== 0 ? (
              <p className="mt-3 text-xs font-medium text-amber-700">
                {fmt(Math.abs(breakdown.unclassifiedRevenue))} in charges had no department tag and posted to Miscellaneous Income —
                review and reclassify the source transactions when convenient.
              </p>
            ) : null}
            {breakdown.unmatchedPaymentTotal !== 0 ? (
              <p className="mt-1 text-xs font-medium text-amber-700">
                {fmt(breakdown.unmatchedPaymentTotal)} in payments had an unrecognized settlement method and were not matched to a
                clearing account.
              </p>
            ) : null}
            <p className="mt-3 text-xs text-slate-400">
              {breakdown.folioLineCount} folio line(s), {breakdown.walkInFbOrderCount} walk-in F&amp;B order(s) for {date}.
            </p>
          </>
        ) : (
          <p className="mt-6 text-sm text-slate-500">No activity found for this date.</p>
        )}
      </div>

      <h2 className="mt-8 text-sm font-semibold text-slate-800">Run history</h2>
      {runs.length === 0 ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No night audits run yet.
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Room</th>
                  <th className="px-4 py-3 text-right">F&amp;B</th>
                  <th className="px-4 py-3 text-right">Other</th>
                  <th className="px-4 py-3 text-right">Guest ledger</th>
                  <th className="px-4 py-3">Posted</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{r.auditDate}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.breakdown.roomRevenue)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.breakdown.fbRevenue)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.breakdown.otherRevenue)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.breakdown.guestLedgerNet)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">{formatDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
