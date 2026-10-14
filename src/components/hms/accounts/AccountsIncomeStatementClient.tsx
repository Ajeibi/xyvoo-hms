"use client";

import { useState } from "react";
import { Download, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IncomeStatementResult } from "@/lib/hms/financial-statements";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";

function toCsvValue(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(toCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function AccountsIncomeStatementClient({
  slug,
  initialResult,
  initialDateFrom,
  initialDateTo,
  currency,
  canAccessAllDepartments,
}: {
  slug: string;
  initialResult: IncomeStatementResult;
  initialDateFrom: string;
  initialDateTo: string;
  currency: string;
  canAccessAllDepartments: boolean;
}) {
  const [result, setResult] = useState(initialResult);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [loading, setLoading] = useState(false);

  const runReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug, dateFrom, dateTo });
      const res = await fetch(`/api/hotel/accounts/income-statement?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Account", "Balance"]];
    rows.push(["Revenue", ""]);
    for (const r of result.revenueRows) rows.push([`${r.code} ${r.name}`, r.balance]);
    rows.push(["Total Revenue", result.totalRevenue]);
    rows.push(["Expenses", ""]);
    for (const r of result.expenseRows) rows.push([`${r.code} ${r.name}`, r.balance]);
    rows.push(["Total Expenses", result.totalExpense]);
    rows.push(["Net Income", result.netIncome]);
    downloadCsv(`income-statement-${dateFrom}-to-${dateTo}.csv`, rows);
  };

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Income statement"
        description={`Revenue and expenses for the selected period${currency ? ` (${currency})` : ""}.`}
        actions={
          <button type="button" className={`${hmsButton.secondary} print:hidden`} onClick={exportCsv}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </button>
        }
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm print:hidden">
        <div className="w-[12rem]">
          <HmsField id="income-statement-from" label="From">
            <input id="income-statement-from" type="date" className={hmsInput} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </HmsField>
        </div>
        <div className="w-[12rem]">
          <HmsField id="income-statement-to" label="To">
            <input id="income-statement-to" type="date" className={hmsInput} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </HmsField>
        </div>
        <button type="button" className={hmsButton.secondary} disabled={loading} onClick={() => void runReport()}>
          {loading ? "Loading…" : "Run report"}
        </button>
      </div>

      <HmsCard
        id="income-statement-report"
        title="Profit and loss"
        icon={TrendingUp}
        meaning="money"
        flush
        className="print:border-0 print:shadow-none"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-5 py-3">Account</th>
                <th scope="col" className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th scope="colgroup" colSpan={2} className="px-5 py-2 text-left text-sm font-semibold text-slate-800">
                  Revenue
                </th>
              </tr>
              {result.revenueRows.length === 0 ? (
                <tr className="border-b border-slate-100">
                  <td colSpan={2} className="px-5 py-3 text-sm text-slate-600">
                    No revenue posted in this period.
                  </td>
                </tr>
              ) : (
                result.revenueRows.map((r) => (
                  <tr key={r.accountId} className="border-b border-slate-100">
                    <td className="px-5 py-3 text-slate-900">
                      <code className="mr-2 font-mono text-xs text-slate-600">{r.code}</code>
                      {r.name}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-900">{r.balance.toFixed(2)}</td>
                  </tr>
                ))
              )}
              <tr className="border-b border-slate-200 bg-slate-50/40 font-semibold text-slate-900">
                <th scope="row" className="px-5 py-3 text-left">Total revenue</th>
                <td className="px-5 py-3 text-right tabular-nums">{result.totalRevenue.toFixed(2)}</td>
              </tr>

              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th scope="colgroup" colSpan={2} className="px-5 py-2 text-left text-sm font-semibold text-slate-800">
                  Expenses
                </th>
              </tr>
              {result.expenseRows.length === 0 ? (
                <tr className="border-b border-slate-100">
                  <td colSpan={2} className="px-5 py-3 text-sm text-slate-600">
                    No expenses posted in this period.
                  </td>
                </tr>
              ) : (
                result.expenseRows.map((r) => (
                  <tr key={r.accountId} className="border-b border-slate-100">
                    <td className="px-5 py-3 text-slate-900">
                      <code className="mr-2 font-mono text-xs text-slate-600">{r.code}</code>
                      {r.name}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-900">{r.balance.toFixed(2)}</td>
                  </tr>
                ))
              )}
              <tr className="bg-slate-50/40 font-semibold text-slate-900">
                <th scope="row" className="px-5 py-3 text-left">Total expenses</th>
                <td className="px-5 py-3 text-right tabular-nums">{result.totalExpense.toFixed(2)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 text-base font-semibold text-slate-900">
                <th scope="row" className="px-5 py-3 text-left">
                  Net income{result.netIncome < 0 ? <span className="ml-2 text-sm font-medium text-red-700">(a loss)</span> : null}
                </th>
                <td className={cn("px-5 py-3 text-right tabular-nums", result.netIncome < 0 ? "text-red-700" : "text-emerald-700")}>
                  {result.netIncome.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </HmsCard>
    </HmsPage>
  );
}
