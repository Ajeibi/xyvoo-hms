"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CashFlowLineItem, CashFlowStatementResult } from "@/lib/hms/financial-statements";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

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

function LineItemRows({ items }: { items: CashFlowLineItem[] }) {
  if (items.length === 0) {
    return (
      <tr>
        <td colSpan={2} className="px-4 py-2 text-sm text-slate-400">
          No activity in this section for the period.
        </td>
      </tr>
    );
  }
  return (
    <>
      {items.map((i) => (
        <tr key={i.accountId} className="border-b border-slate-100 last:border-0">
          <td className="px-4 py-2">
            <code className="mr-2 font-mono text-xs text-slate-400">{i.code}</code>
            {i.name}
          </td>
          <td className="px-4 py-2 text-right tabular-nums text-slate-900">{i.delta.toFixed(2)}</td>
        </tr>
      ))}
    </>
  );
}

export function AccountsCashFlowClient({
  slug,
  initialResult,
  initialDateFrom,
  initialDateTo,
  currency,
  canAccessAllDepartments,
}: {
  slug: string;
  initialResult: CashFlowStatementResult;
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
      const res = await fetch(`/api/hotel/accounts/cash-flow?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Line", "Amount"]];
    rows.push(["Net Income", result.netIncome]);
    rows.push(["Operating Activities", ""]);
    for (const i of result.operatingItems) rows.push([`${i.code} ${i.name}`, i.delta]);
    rows.push(["Total Operating", result.operatingTotal]);
    rows.push(["Investing Activities", ""]);
    for (const i of result.investingItems) rows.push([`${i.code} ${i.name}`, i.delta]);
    rows.push(["Total Investing", result.investingTotal]);
    rows.push(["Financing Activities", ""]);
    for (const i of result.financingItems) rows.push([`${i.code} ${i.name}`, i.delta]);
    rows.push(["Total Financing", result.financingTotal]);
    rows.push(["Net Cash Flow", result.netCashFlow]);
    rows.push(["Beginning Cash", result.beginningCash]);
    rows.push(["Ending Cash", result.endingCash]);
    downloadCsv(`cash-flow-${dateFrom}-to-${dateTo}.csv`, rows);
  };

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Cash flow</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Where cash came from and went, indirect method{currency ? ` (${currency})` : ""}.
      </p>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">From</p>
          <Input type="date" className="h-10 w-[11rem]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">To</p>
          <Input type="date" className="h-10 w-[11rem]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void runReport()}>
          {loading ? "Loading…" : "Run report"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Line</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50/70">
              <td colSpan={2} className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-500">
                Operating activities
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="px-4 py-2 text-slate-600">Net Income</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-900">{result.netIncome.toFixed(2)}</td>
            </tr>
            <LineItemRows items={result.operatingItems} />
            <tr className="border-t border-slate-200 font-medium">
              <td className="px-4 py-2">Total Operating</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.operatingTotal.toFixed(2)}</td>
            </tr>

            <tr className="bg-slate-50/70">
              <td colSpan={2} className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-500">
                Investing activities
              </td>
            </tr>
            <LineItemRows items={result.investingItems} />
            <tr className="border-t border-slate-200 font-medium">
              <td className="px-4 py-2">Total Investing</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.investingTotal.toFixed(2)}</td>
            </tr>

            <tr className="bg-slate-50/70">
              <td colSpan={2} className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-500">
                Financing activities
              </td>
            </tr>
            <LineItemRows items={result.financingItems} />
            <tr className="border-t border-slate-200 font-medium">
              <td className="px-4 py-2">Total Financing</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.financingTotal.toFixed(2)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 text-base font-semibold">
              <td className="px-4 py-2.5">Net Cash Flow</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{result.netCashFlow.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="px-4 py-1.5 text-sm text-slate-600">Beginning Cash</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-slate-700">{result.beginningCash.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="px-4 py-1.5 text-sm text-slate-600">Ending Cash</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-slate-700">{result.endingCash.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-semibold">Reconciliation</td>
              <td className={cn("px-4 py-2.5 text-right tabular-nums font-semibold", result.reconciles ? "text-emerald-700" : "text-red-600")}>
                {result.reconciles ? "Reconciles" : "Does not reconcile — check the ledger"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
