"use client";

import { useState } from "react";
import { PiggyBank, Target } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";
import { monthsOfYear, spreadEvenly, type BudgetGridRow, type BudgetLine, type BudgetReport } from "@/lib/hms/account-budgets";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Diff({ value }: { value: number }) {
  return <span className={cn("tabular-nums font-medium", value < 0 ? "text-red-700" : value > 0 ? "text-emerald-700" : "text-slate-700")}>{value > 0 ? "+" : ""}{fmt(value)}</span>;
}

function LineRows({ title, lines }: { title: string; lines: BudgetLine[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      <tr className="border-b border-slate-100 bg-slate-50/70">
        <th scope="colgroup" colSpan={5} className="px-5 py-2 text-left text-sm font-semibold text-slate-800">{title}</th>
      </tr>
      {lines.map((l) => (
        <tr key={l.accountId} className="border-b border-slate-100">
          <td className="px-5 py-3 text-slate-900"><code className="mr-2 font-mono text-xs text-slate-600">{l.code}</code>{l.name}</td>
          <td className="px-5 py-3 text-right tabular-nums">{fmt(l.actual)}</td>
          <td className="px-5 py-3 text-right tabular-nums">{fmt(l.budget)}</td>
          <td className="px-5 py-3 text-right"><Diff value={l.difference} /></td>
          <td className="px-5 py-3 text-right tabular-nums text-slate-600">{l.percentOfBudget === null ? "—" : `${l.percentOfBudget}%`}</td>
        </tr>
      ))}
    </>
  );
}

export function AccountsBudgetsClient({
  slug,
  initialReport,
  initialGrid,
  initialYear,
  initialDateFrom,
  initialDateTo,
  canEdit,
  canAccessAllDepartments,
}: {
  slug: string;
  initialReport: BudgetReport;
  initialGrid: BudgetGridRow[];
  initialYear: number;
  initialDateFrom: string;
  initialDateTo: string;
  canEdit: boolean;
  canAccessAllDepartments: boolean;
}) {
  const [report, setReport] = useState(initialReport);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [year, setYear] = useState(initialYear);
  const [grid, setGrid] = useState(initialGrid);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const runReport = async (from = dateFrom, to = dateTo) => {
    const res = await fetch(`/api/hotel/accounts/budgets?${new URLSearchParams({ slug, dateFrom: from, dateTo: to })}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setReport(data);
  };

  const loadYear = async (y: number) => {
    setYear(y);
    const res = await fetch(`/api/hotel/accounts/budgets?${new URLSearchParams({ slug, year: String(y) })}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setGrid(data.rows); setDirty(new Set()); }
  };

  const setCell = (accountId: string, month: number, value: string) => {
    setGrid((g) => g.map((r) => (r.accountId === accountId ? { ...r, months: r.months.map((m, i) => (i === month ? Math.max(0, Number(value) || 0) : m)) } : r)));
    setDirty((d) => new Set(d).add(`${accountId}|${month}`));
  };

  const spread = (accountId: string, total: number) => {
    const parts = spreadEvenly(total);
    setGrid((g) => g.map((r) => (r.accountId === accountId ? { ...r, months: parts } : r)));
    setDirty((d) => { const n = new Set(d); for (let i = 0; i < 12; i++) n.add(`${accountId}|${i}`); return n; });
  };

  const save = async () => {
    const months = monthsOfYear(year);
    const entries = [...dirty].map((k) => {
      const [accountId, i] = k.split("|");
      return { accountId, month: months[Number(i)], amount: grid.find((r) => r.accountId === accountId)?.months[Number(i)] ?? 0 };
    });
    if (entries.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/accounts/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, entries }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toastError("Could not save budgets", data.error ?? "Try again."); return; }
      toastSuccess("Budgets saved");
      setDirty(new Set());
      void runReport();
    } finally {
      setBusy(false);
    }
  };

  const t = report.totals;

  return (
    <HmsPage wide>
      <HmsPageHeader eyebrow="Accounts" meaning="money" title="Budgets" description="Set a budget for each revenue and expense account by month, then see how the hotel is doing against it. A positive difference is good news: more revenue, or less spent." />
      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end print:hidden">
        <div className="w-full sm:w-48"><HmsField id="budget-from" label="From"><input id="budget-from" type="date" className={hmsInput} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></HmsField></div>
        <div className="w-full sm:w-48"><HmsField id="budget-to" label="To"><input id="budget-to" type="date" className={hmsInput} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></HmsField></div>
        <button type="button" className={`${hmsButton.secondary} w-full sm:w-auto`} onClick={() => void runReport()}>Run report</button>
      </div>

      <HmsCard id="budget-report" title="Actual against budget" icon={Target} meaning="money" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-5 py-3">Account</th>
                <th scope="col" className="px-5 py-3 text-right">Actual</th>
                <th scope="col" className="px-5 py-3 text-right">Budget</th>
                <th scope="col" className="px-5 py-3 text-right">Difference</th>
                <th scope="col" className="px-5 py-3 text-right">Used</th>
              </tr>
            </thead>
            <tbody>
              <LineRows title="Revenue" lines={report.revenueLines} />
              <LineRows title="Expenses" lines={report.expenseLines} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                <th scope="row" className="px-5 py-3 text-left">Net income</th>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(t.netIncome.actual)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(t.netIncome.budget)}</td>
                <td className="px-5 py-3 text-right"><Diff value={t.netIncome.difference} /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </HmsCard>

      <HmsCard
        id="budget-grid"
        title="Monthly budgets"
        icon={PiggyBank}
        meaning="money"
        flush
        actions={
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="budget-year">Year</label>
            <input id="budget-year" type="number" className={`${hmsInput} w-24`} value={year} onChange={(e) => void loadYear(Number(e.target.value))} />
            {canEdit ? <button type="button" className={hmsButton.primary} disabled={busy || dirty.size === 0} onClick={() => void save()}>{busy ? "Saving…" : "Save budgets"}</button> : null}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Account</th>
                {MONTH_NAMES.map((m) => (<th key={m} scope="col" className="px-1 py-3 text-right">{m}</th>))}
                <th scope="col" className="px-4 py-3 text-right">Year</th>
              </tr>
            </thead>
            <tbody>
              {grid.map((r) => {
                const total = r.months.reduce((s, n) => s + n, 0);
                return (
                  <tr key={r.accountId} className="border-b border-slate-100">
                    <td className="px-4 py-2 text-slate-900"><code className="mr-2 font-mono text-xs text-slate-600">{r.code}</code>{r.name}</td>
                    {r.months.map((m, i) => (
                      <td key={i} className="px-1 py-2">
                        <input
                          aria-label={`${r.name}, ${MONTH_NAMES[i]}`}
                          type="number"
                          min="0"
                          disabled={!canEdit}
                          className="h-9 w-20 rounded-lg border border-slate-300 px-1.5 text-right text-sm tabular-nums disabled:bg-slate-50"
                          value={m || ""}
                          placeholder="0"
                          onChange={(e) => setCell(r.accountId, i, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      {canEdit ? (
                        <input
                          aria-label={`${r.name}, whole year (spread evenly)`}
                          type="number"
                          min="0"
                          className="h-9 w-28 rounded-lg border border-slate-300 px-1.5 text-right text-sm tabular-nums"
                          value={total || ""}
                          placeholder="0"
                          onChange={(e) => spread(r.accountId, Math.max(0, Number(e.target.value) || 0))}
                        />
                      ) : (
                        <span className="tabular-nums">{fmt(total)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-sm text-slate-600">Type a yearly figure in the last column to spread it evenly over the twelve months.</p>
      </HmsCard>
    </HmsPage>
  );
}
