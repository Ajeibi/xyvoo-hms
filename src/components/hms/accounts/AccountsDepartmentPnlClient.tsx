"use client";

import { useState } from "react";
import { Download, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import type { DepartmentPnl, PnlAccountRow } from "@/lib/hms/department-pnl";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Rows({ rows }: { rows: PnlAccountRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.code} className="flex justify-between gap-3 py-1 text-sm text-slate-700">
          <span><code className="mr-2 font-mono text-xs text-slate-600">{r.code}</code>{r.name}</span>
          <span className="tabular-nums">{fmt(r.amount)}</span>
        </div>
      ))}
    </>
  );
}

export function AccountsDepartmentPnlClient({
  slug,
  initialResult,
  initialDateFrom,
  initialDateTo,
  currency,
  canAccessAllDepartments,
}: {
  slug: string;
  initialResult: DepartmentPnl;
  initialDateFrom: string;
  initialDateTo: string;
  currency: string;
  canAccessAllDepartments: boolean;
}) {
  const [result, setResult] = useState(initialResult);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel/accounts/department-pnl?${new URLSearchParams({ slug, dateFrom, dateTo })}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Department", "Line", "Revenue", "Costs", "Profit"]];
    for (const d of result.departments) {
      for (const r of d.revenueRows) rows.push([d.label, `${r.code} ${r.name}`, r.amount, "", ""]);
      for (const r of d.costRows) rows.push([d.label, `${r.code} ${r.name}`, "", r.amount, ""]);
      rows.push([d.label, "Total", d.revenue, d.costs, d.profit]);
    }
    rows.push(["All departments", "Net income", result.totalRevenue, result.totalCosts, result.netIncome]);
    downloadCsv(`department-pnl-${dateFrom}-to-${dateTo}.csv`, rows);
  };

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Department profit and loss"
        description={`Each department's revenue, direct costs and profit, the way hotel owners expect to see them${currency ? ` (${currency})` : ""}. Revenue follows its account; costs follow the department on the journal line.`}
        actions={<button type="button" className={`${hmsButton.secondary} print:hidden`} onClick={exportCsv}><Download className="h-4 w-4" aria-hidden /> Export CSV</button>}
      />
      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm print:hidden">
        <div className="w-[12rem]"><HmsField id="dp-from" label="From"><input id="dp-from" type="date" className={hmsInput} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></HmsField></div>
        <div className="w-[12rem]"><HmsField id="dp-to" label="To"><input id="dp-to" type="date" className={hmsInput} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></HmsField></div>
        <button type="button" className={hmsButton.secondary} disabled={loading} onClick={() => void run()}>{loading ? "Loading…" : "Run report"}</button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {result.departments.map((d) => (
          <HmsCard key={d.department} id={`pnl-${d.department}`} title={d.label} icon={Layers} meaning="money">
            {d.revenueRows.length + d.costRows.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing posted in this period.</p>
            ) : (
              <>
                {d.revenueRows.length > 0 ? <p className="text-sm font-semibold text-slate-800">Revenue</p> : null}
                <Rows rows={d.revenueRows} />
                {d.costRows.length > 0 ? <p className="mt-3 text-sm font-semibold text-slate-800">{d.department === "undistributed" ? "Expenses" : "Direct costs"}</p> : null}
                <Rows rows={d.costRows} />
                <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                  <span>{d.department === "undistributed" ? "Net" : "Departmental profit"}{d.margin !== null ? ` (${d.margin}%)` : ""}</span>
                  <span className={cn("tabular-nums", d.profit < 0 ? "text-red-700" : "text-emerald-700")}>{fmt(d.profit)}</span>
                </div>
              </>
            )}
          </HmsCard>
        ))}
      </div>

      <div className="flex justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-900">
        <span>Net income, all departments</span>
        <span className={cn("tabular-nums", result.netIncome < 0 ? "text-red-700" : "text-emerald-700")}>{fmt(result.netIncome)}</span>
      </div>
    </HmsPage>
  );
}
