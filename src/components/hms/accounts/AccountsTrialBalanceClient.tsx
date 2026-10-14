"use client";

import { Fragment, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrialBalanceRow } from "@/lib/hms/journal-entries";
import type { AccountType } from "@/lib/hms/chart-of-accounts";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};
const ACCOUNT_TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

export function AccountsTrialBalanceClient({
  slug,
  initialRows,
  currency,
  canAccessAllDepartments,
}: {
  slug: string;
  initialRows: TrialBalanceRow[];
  currency: string;
  canAccessAllDepartments: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [asOfDate, setAsOfDate] = useState("");
  const [loading, setLoading] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<AccountType, TrialBalanceRow[]>();
    for (const t of ACCOUNT_TYPE_ORDER) map.set(t, []);
    for (const r of rows) map.get(r.type)?.push(r);
    return map;
  }, [rows]);

  const totals = useMemo(
    () => rows.reduce((acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }), { debit: 0, credit: 0 }),
    [rows],
  );

  const runReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (asOfDate) params.set("asOfDate", asOfDate);
      const res = await fetch(`/api/hotel/accounts/trial-balance?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  };

  const difference = Math.abs(totals.debit - totals.credit);
  const outOfBalance = difference > 0.01;

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Trial balance"
        description={`Every account's debit and credit activity, and its net balance${currency ? ` (${currency})` : ""}.`}
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm print:hidden">
        <div className="w-[12rem]">
          <HmsField id="trial-balance-as-of" label="As of date">
            <input
              id="trial-balance-as-of"
              type="date"
              className={hmsInput}
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </HmsField>
        </div>
        <button type="button" className={hmsButton.secondary} disabled={loading} onClick={() => void runReport()}>
          {loading ? "Loading…" : "Run report"}
        </button>
        {asOfDate ? (
          <button
            type="button"
            className={hmsButton.quiet}
            onClick={() => {
              setAsOfDate("");
              setRows(initialRows);
            }}
          >
            Reset to today
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <HmsEmptyState
          art="chart"
          meaning="money"
          title="No accounts to report on yet"
          description="Set up the chart of accounts first, then the trial balance fills in as entries are posted."
        />
      ) : (
        <HmsCard
          id="trial-balance-report"
          title="All accounts"
          icon={Scale}
          meaning="money"
          flush
          className="print:border-0 print:shadow-none"
          actions={
            outOfBalance ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-sm font-medium text-rose-800">
                <CircleAlert className="h-4 w-4" aria-hidden />
                Out of balance by {difference.toFixed(2)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-800">
                <CircleCheck className="h-4 w-4" aria-hidden />
                Balanced
              </span>
            )
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3">Account</th>
                  <th scope="col" className="px-5 py-3 text-right">Debit</th>
                  <th scope="col" className="px-5 py-3 text-right">Credit</th>
                  <th scope="col" className="px-5 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ACCOUNT_TYPE_ORDER.map((type) => {
                  const typeRows = grouped.get(type) ?? [];
                  if (typeRows.length === 0) return null;
                  return (
                    <Fragment key={type}>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th scope="colgroup" colSpan={4} className="px-5 py-2 text-left text-sm font-semibold text-slate-800">
                          {TYPE_LABELS[type]}
                        </th>
                      </tr>
                      {typeRows.map((r) => (
                        <tr key={r.accountId} className="border-b border-slate-100">
                          <td className="px-5 py-3 text-slate-900">
                            <code className="mr-2 font-mono text-xs text-slate-600">{r.code}</code>
                            {r.name}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-700">{r.debit > 0 ? r.debit.toFixed(2) : "—"}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-700">{r.credit > 0 ? r.credit.toFixed(2) : "—"}</td>
                          <td
                            className={cn(
                              "px-5 py-3 text-right tabular-nums font-medium",
                              r.balance < 0 ? "text-red-700" : "text-slate-900",
                            )}
                          >
                            {r.balance.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                  <th scope="row" className="px-5 py-3 text-left">Total</th>
                  <td className="px-5 py-3 text-right tabular-nums">{totals.debit.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{totals.credit.toFixed(2)}</td>
                  <td className={cn("px-5 py-3 text-right", outOfBalance ? "text-red-700" : "text-emerald-700")}>
                    {outOfBalance ? `Out of balance by ${difference.toFixed(2)}` : "Balanced"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </HmsCard>
      )}
    </HmsPage>
  );
}
