"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BalanceSheetResult } from "@/lib/hms/financial-statements";
import type { TrialBalanceRow } from "@/lib/hms/journal-entries";
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

function AccountRows({ rows }: { rows: TrialBalanceRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.accountId} className="border-b border-slate-100 last:border-0">
          <td className="px-4 py-2">
            <code className="mr-2 font-mono text-xs text-slate-400">{r.code}</code>
            {r.name}
          </td>
          <td className="px-4 py-2 text-right tabular-nums text-slate-900">{r.balance.toFixed(2)}</td>
        </tr>
      ))}
    </>
  );
}

export function AccountsBalanceSheetClient({
  slug,
  initialResult,
  initialAsOfDate,
  currency,
  canAccessAllDepartments,
}: {
  slug: string;
  initialResult: BalanceSheetResult;
  initialAsOfDate: string;
  currency: string;
  canAccessAllDepartments: boolean;
}) {
  const [result, setResult] = useState(initialResult);
  const [asOfDate, setAsOfDate] = useState(initialAsOfDate);
  const [loading, setLoading] = useState(false);

  const runReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug, asOfDate });
      const res = await fetch(`/api/hotel/accounts/balance-sheet?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Account", "Balance"]];
    rows.push(["Assets", ""]);
    for (const r of result.assetRows) rows.push([`${r.code} ${r.name}`, r.balance]);
    rows.push(["Total Assets", result.totalAssets]);
    rows.push(["Liabilities", ""]);
    for (const r of result.liabilityRows) rows.push([`${r.code} ${r.name}`, r.balance]);
    rows.push(["Equity", ""]);
    for (const r of result.equityRows) rows.push([`${r.code} ${r.name}`, r.balance]);
    rows.push(["Net Income Since Last Close (Unclosed)", result.netIncomeSinceLastClose]);
    rows.push(["Total Liabilities & Equity", result.totalLiabilitiesAndEquity]);
    downloadCsv(`balance-sheet-${asOfDate}.csv`, rows);
  };

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Balance sheet</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Assets, liabilities and equity as of the selected date{currency ? ` (${currency})` : ""}.
      </p>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">As of date</p>
          <Input type="date" className="h-10 w-[11rem]" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
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
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50/70">
              <td colSpan={2} className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-500">
                Assets
              </td>
            </tr>
            <AccountRows rows={result.assetRows} />
            <tr className="border-t border-slate-200 font-medium">
              <td className="px-4 py-2">Total Assets</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.totalAssets.toFixed(2)}</td>
            </tr>

            <tr className="bg-slate-50/70">
              <td colSpan={2} className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-500">
                Liabilities
              </td>
            </tr>
            <AccountRows rows={result.liabilityRows} />

            <tr className="bg-slate-50/70">
              <td colSpan={2} className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-500">
                Equity
              </td>
            </tr>
            <AccountRows rows={result.equityRows} />
            <tr className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2 text-slate-600">Net Income Since Last Close (Unclosed)</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-900">{result.netIncomeSinceLastClose.toFixed(2)}</td>
            </tr>
            <tr className="border-t border-slate-200 font-medium">
              <td className="px-4 py-2">Total Liabilities &amp; Equity</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.totalLiabilitiesAndEquity.toFixed(2)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td className="px-4 py-2.5">Balance check</td>
              <td className={cn("px-4 py-2.5 text-right tabular-nums", result.balanced ? "text-emerald-700" : "text-red-600")}>
                {result.balanced ? "Balanced" : "Out of balance"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
