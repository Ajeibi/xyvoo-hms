"use client";

import { useState } from "react";
import { Download, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BalanceSheetResult } from "@/lib/hms/financial-statements";
import type { TrialBalanceRow } from "@/lib/hms/journal-entries";
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

function SectionHeading({ label }: { label: string }) {
  return (
    <tr className="border-b border-slate-100 bg-slate-50/70">
      <th scope="colgroup" colSpan={2} className="px-5 py-2 text-left text-sm font-semibold text-slate-800">
        {label}
      </th>
    </tr>
  );
}

function AccountRows({ rows }: { rows: TrialBalanceRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.accountId} className="border-b border-slate-100">
          <td className="px-5 py-3 text-slate-900">
            <code className="mr-2 font-mono text-xs text-slate-600">{r.code}</code>
            {r.name}
          </td>
          <td className="px-5 py-3 text-right tabular-nums text-slate-900">{r.balance.toFixed(2)}</td>
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

  const difference = Math.abs(result.totalAssets - result.totalLiabilitiesAndEquity);

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Balance sheet"
        description={`Assets, liabilities and equity as of the selected date${currency ? ` (${currency})` : ""}.`}
        actions={
          <button type="button" className={`${hmsButton.secondary} print:hidden`} onClick={exportCsv}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </button>
        }
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm print:hidden">
        <div className="w-[12rem]">
          <HmsField id="balance-sheet-as-of" label="As of date">
            <input id="balance-sheet-as-of" type="date" className={hmsInput} value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </HmsField>
        </div>
        <button type="button" className={hmsButton.secondary} disabled={loading} onClick={() => void runReport()}>
          {loading ? "Loading…" : "Run report"}
        </button>
      </div>

      <HmsCard
        id="balance-sheet-report"
        title="Financial position"
        icon={Landmark}
        meaning="money"
        flush
        className="print:border-0 print:shadow-none"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-5 py-3">Account</th>
                <th scope="col" className="px-5 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <SectionHeading label="Assets" />
              <AccountRows rows={result.assetRows} />
              <tr className="border-b border-slate-200 bg-slate-50/40 font-semibold text-slate-900">
                <th scope="row" className="px-5 py-3 text-left">Total assets</th>
                <td className="px-5 py-3 text-right tabular-nums">{result.totalAssets.toFixed(2)}</td>
              </tr>

              <SectionHeading label="Liabilities" />
              <AccountRows rows={result.liabilityRows} />

              <SectionHeading label="Equity" />
              <AccountRows rows={result.equityRows} />
              <tr className="border-b border-slate-100">
                <td className="px-5 py-3 text-slate-700">Net income since last close (not yet closed)</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-900">{result.netIncomeSinceLastClose.toFixed(2)}</td>
              </tr>
              <tr className="bg-slate-50/40 font-semibold text-slate-900">
                <th scope="row" className="px-5 py-3 text-left">Total liabilities and equity</th>
                <td className="px-5 py-3 text-right tabular-nums">{result.totalLiabilitiesAndEquity.toFixed(2)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <th scope="row" className="px-5 py-3 text-left text-slate-900">Balance check</th>
                <td className={cn("px-5 py-3 text-right tabular-nums", result.balanced ? "text-emerald-700" : "text-red-700")}>
                  {result.balanced ? "Balanced" : `Out of balance by ${difference.toFixed(2)}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </HmsCard>
    </HmsPage>
  );
}
