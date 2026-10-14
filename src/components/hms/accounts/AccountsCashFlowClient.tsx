"use client";

import { useState } from "react";
import { ArrowLeftRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CashFlowLineItem, CashFlowStatementResult } from "@/lib/hms/financial-statements";
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

function SubtotalRow({ label, value }: { label: string; value: number }) {
  return (
    <tr className="border-b border-slate-200 bg-slate-50/40 font-semibold text-slate-900">
      <th scope="row" className="px-5 py-3 text-left">{label}</th>
      <td className="px-5 py-3 text-right tabular-nums">{value.toFixed(2)}</td>
    </tr>
  );
}

function LineItemRows({ items }: { items: CashFlowLineItem[] }) {
  if (items.length === 0) {
    return (
      <tr className="border-b border-slate-100">
        <td colSpan={2} className="px-5 py-3 text-sm text-slate-600">
          No activity in this section for the period.
        </td>
      </tr>
    );
  }
  return (
    <>
      {items.map((i) => (
        <tr key={i.accountId} className="border-b border-slate-100">
          <td className="px-5 py-3 text-slate-900">
            <code className="mr-2 font-mono text-xs text-slate-600">{i.code}</code>
            {i.name}
          </td>
          <td className="px-5 py-3 text-right tabular-nums text-slate-900">{i.delta.toFixed(2)}</td>
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
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Cash flow"
        description={`Where cash came from and went, indirect method${currency ? ` (${currency})` : ""}.`}
        actions={
          <button type="button" className={`${hmsButton.secondary} print:hidden`} onClick={exportCsv}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </button>
        }
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm print:hidden">
        <div className="w-[12rem]">
          <HmsField id="cash-flow-from" label="From">
            <input id="cash-flow-from" type="date" className={hmsInput} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </HmsField>
        </div>
        <div className="w-[12rem]">
          <HmsField id="cash-flow-to" label="To">
            <input id="cash-flow-to" type="date" className={hmsInput} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </HmsField>
        </div>
        <button type="button" className={hmsButton.secondary} disabled={loading} onClick={() => void runReport()}>
          {loading ? "Loading…" : "Run report"}
        </button>
      </div>

      <HmsCard
        id="cash-flow-report"
        title="Cash flow statement"
        icon={ArrowLeftRight}
        meaning="money"
        flush
        className="print:border-0 print:shadow-none"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-5 py-3">Line</th>
                <th scope="col" className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <SectionHeading label="Operating activities" />
              <tr className="border-b border-slate-100">
                <td className="px-5 py-3 text-slate-700">Net income</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-900">{result.netIncome.toFixed(2)}</td>
              </tr>
              <LineItemRows items={result.operatingItems} />
              <SubtotalRow label="Total operating" value={result.operatingTotal} />

              <SectionHeading label="Investing activities" />
              <LineItemRows items={result.investingItems} />
              <SubtotalRow label="Total investing" value={result.investingTotal} />

              <SectionHeading label="Financing activities" />
              <LineItemRows items={result.financingItems} />
              <SubtotalRow label="Total financing" value={result.financingTotal} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 text-base font-semibold text-slate-900">
                <th scope="row" className="px-5 py-3 text-left">Net cash flow</th>
                <td className="px-5 py-3 text-right tabular-nums">{result.netCashFlow.toFixed(2)}</td>
              </tr>
              <tr className="border-t border-slate-100">
                <th scope="row" className="px-5 py-2.5 text-left text-sm font-normal text-slate-700">Beginning cash</th>
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-900">{result.beginningCash.toFixed(2)}</td>
              </tr>
              <tr className="border-t border-slate-100">
                <th scope="row" className="px-5 py-2.5 text-left text-sm font-normal text-slate-700">Ending cash</th>
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-900">{result.endingCash.toFixed(2)}</td>
              </tr>
              <tr className="border-t border-slate-200">
                <th scope="row" className="px-5 py-3 text-left font-semibold text-slate-900">Reconciliation</th>
                <td className={cn("px-5 py-3 text-right font-semibold", result.reconciles ? "text-emerald-700" : "text-red-700")}>
                  {result.reconciles ? "Reconciles" : "Does not reconcile — check the ledger"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </HmsCard>
    </HmsPage>
  );
}
