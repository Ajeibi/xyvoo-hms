"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  BedDouble,
  BookUser,
  Building2,
  CircleAlert,
  CircleHelp,
  CreditCard,
  History,
  Landmark,
  Moon,
  Shapes,
  UtensilsCrossed,
} from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import type { NightAuditBreakdown, NightAuditRunRow } from "@/lib/hms/night-audit";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import {
  HmsCard,
  HmsEmptyState,
  HmsField,
  HmsPage,
  HmsPageHeader,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
  hmsInput,
} from "@/components/hms/hms-ui";

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number) {
  return n.toFixed(2);
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <span>{children}</span>
    </p>
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
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Night audit"
        description="Summarises a day's guest folio activity and walk-in F&B sales into one balanced posting to the ledger."
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsCard
        id="night-audit-day"
        title={`Day summary for ${date}`}
        icon={Moon}
        meaning="money"
        className="print:border-0 print:shadow-none"
        actions={
          <div className="flex flex-wrap items-end gap-3 print:hidden">
            <div className="w-[12rem]">
              <HmsField id="night-audit-date" label="Audit date">
                <input id="night-audit-date" type="date" className={hmsInput} value={date} onChange={(e) => setDate(e.target.value)} />
              </HmsField>
            </div>
            {canRun ? (
              <button type="button" className={hmsButton.primary} disabled={running || loading || alreadyRun} onClick={() => void runAudit()}>
                {running ? "Posting…" : alreadyRun ? "Already audited" : "Run night audit"}
              </button>
            ) : null}
          </div>
        }
      >
        {loading ? (
          <p role="status" className="text-sm text-slate-600">
            Loading…
          </p>
        ) : breakdown ? (
          <div className="space-y-4">
            <HmsStatStrip label={`Revenue and settlements for ${date}`}>
              <HmsStatTile label="Room revenue" value={fmt(breakdown.roomRevenue)} icon={BedDouble} meaning="rooms" />
              <HmsStatTile label="F&B revenue" value={fmt(breakdown.fbRevenue)} icon={UtensilsCrossed} meaning="food" />
              <HmsStatTile label="Other department revenue" value={fmt(breakdown.otherRevenue)} icon={Shapes} meaning="money" />
              <HmsStatTile
                label="Unclassified revenue"
                value={fmt(breakdown.unclassifiedRevenue)}
                icon={CircleHelp}
                meaning={breakdown.unclassifiedRevenue !== 0 ? "attention" : "neutral"}
                status={breakdown.unclassifiedRevenue !== 0 ? "warning" : undefined}
                statusText="Needs a department"
              />
              <HmsStatTile
                label="VAT and levies"
                value={fmt(breakdown.taxesCollected)}
                icon={Landmark}
                meaning="money"
                hint="Charged on rooms for the government; goes to Taxes Payable"
              />
              <HmsStatTile label="Cash" value={fmt(breakdown.cashTotal)} icon={Banknote} meaning="money" />
              <HmsStatTile label="Card / POS" value={fmt(breakdown.cardTotal)} icon={CreditCard} meaning="money" />
              <HmsStatTile label="City ledger" value={fmt(breakdown.cityLedgerTotal)} icon={Building2} meaning="money" />
              <HmsStatTile label="Guest ledger movement" value={fmt(breakdown.guestLedgerNet)} icon={BookUser} meaning="guests" />
            </HmsStatStrip>
            {breakdown.unclassifiedRevenue !== 0 ? (
              <Warning>
                {fmt(Math.abs(breakdown.unclassifiedRevenue))} in charges had no department tag and posted to Miscellaneous Income.
                Review and reclassify the source transactions when convenient.
              </Warning>
            ) : null}
            {breakdown.unmatchedPaymentTotal !== 0 ? (
              <Warning>
                {fmt(breakdown.unmatchedPaymentTotal)} in payments had an unrecognised settlement method and were not matched to a
                clearing account.
              </Warning>
            ) : null}
            <p className="text-sm text-slate-600">
              {breakdown.folioLineCount} folio line(s), {breakdown.walkInFbOrderCount} walk-in F&amp;B order(s) for {date}.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">No activity found for this date.</p>
        )}
      </HmsCard>

      <HmsCard id="night-audit-history" title="Run history" icon={History} meaning="money" flush className="print:border-0 print:shadow-none">
        {runs.length === 0 ? (
          <HmsEmptyState
            bare
            art="page"
            meaning="money"
            title="No night audits run yet"
            description="Each audit you run appears here with its totals."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3">Date</th>
                  <th scope="col" className="px-5 py-3 text-right">Room</th>
                  <th scope="col" className="px-5 py-3 text-right">F&amp;B</th>
                  <th scope="col" className="px-5 py-3 text-right">Other</th>
                  <th scope="col" className="px-5 py-3 text-right">Guest ledger</th>
                  <th scope="col" className="px-5 py-3">Posted</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="whitespace-nowrap px-5 py-3 text-left font-medium tabular-nums text-slate-900">{r.auditDate}</th>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.breakdown.roomRevenue)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.breakdown.fbRevenue)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.breakdown.otherRevenue)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.breakdown.guestLedgerNet)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">{formatDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>
    </HmsPage>
  );
}
