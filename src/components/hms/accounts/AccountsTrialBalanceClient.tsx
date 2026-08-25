"use client";

import { Fragment, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TrialBalanceRow } from "@/lib/hms/journal-entries";
import type { AccountType } from "@/lib/hms/chart-of-accounts";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

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

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Trial balance</h1>
      <p className="mt-0.5 text-sm text-slate-500">Every account&apos;s debit and credit activity, and its net balance{currency ? ` (${currency})` : ""}.</p>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">As of date</p>
          <Input type="date" className="h-10 w-[11rem]" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void runReport()}>
          {loading ? "Loading…" : "Run report"}
        </Button>
        {asOfDate ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAsOfDate("");
              setRows(initialRows);
            }}
          >
            Reset to today
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No accounts to report on yet — set up the chart of accounts first.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNT_TYPE_ORDER.map((type) => {
                const typeRows = grouped.get(type) ?? [];
                if (typeRows.length === 0) return null;
                return (
                  <Fragment key={type}>
                    <tr className="bg-slate-50/70">
                      <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-500">
                        {TYPE_LABELS[type]}
                      </td>
                    </tr>
                    {typeRows.map((r) => (
                      <tr key={r.accountId} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2">
                          <code className="mr-2 font-mono text-xs text-slate-400">{r.code}</code>
                          {r.name}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.debit > 0 ? r.debit.toFixed(2) : "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.credit > 0 ? r.credit.toFixed(2) : "—"}</td>
                        <td
                          className={cn(
                            "px-4 py-2 text-right tabular-nums font-medium",
                            r.balance < 0 ? "text-red-600" : "text-slate-900",
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
              <tr className="border-t-2 border-slate-200 font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totals.debit.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totals.credit.toFixed(2)}</td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums",
                    Math.abs(totals.debit - totals.credit) > 0.01 ? "text-red-600" : "text-emerald-700",
                  )}
                >
                  {Math.abs(totals.debit - totals.credit) > 0.01 ? "Out of balance" : "Balanced"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
