"use client";

import { useState } from "react";
import { Download, Receipt } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { downloadCsv } from "@/lib/csv";
import type { TaxMonth } from "@/lib/hms/tax-reports";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";

type Report = { months: TaxMonth[]; totals: Omit<TaxMonth, "month">; whtRate: number };

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const COLUMNS: { key: keyof Omit<TaxMonth, "month">; label: string }[] = [
  { key: "vatCollected", label: "VAT collected" },
  { key: "inputVat", label: "VAT paid on bills" },
  { key: "vatPayable", label: "VAT to pay" },
  { key: "stateLevy", label: "State levy" },
  { key: "stampLevy", label: "Stamp levy" },
  { key: "withholdingBase", label: "Bills subject to WHT" },
  { key: "withholdingTax", label: "Withholding tax" },
  { key: "ledgerCredits", label: "Taxes Payable credits in the books" },
];

export function AccountsTaxClient({
  slug,
  initialYear,
  initialReport,
  currency,
  canEdit,
  canAccessAllDepartments,
}: {
  slug: string;
  initialYear: number;
  initialReport: Report;
  currency: string;
  canEdit: boolean;
  canAccessAllDepartments: boolean;
}) {
  const [year, setYear] = useState(initialYear);
  const [report, setReport] = useState(initialReport);
  const [rate, setRate] = useState(String(initialReport.whtRate));
  const [busy, setBusy] = useState(false);

  const load = async (y: number) => {
    setYear(y);
    const res = await fetch(`/api/hotel/accounts/tax?${new URLSearchParams({ slug, year: String(y) })}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setReport(data);
  };

  const saveRate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/accounts/tax", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, whtRate: Number(rate) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toastError("Could not save", data.error ?? "Try again."); return; }
      toastSuccess("Withholding tax rate saved");
      await load(year);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Month", ...COLUMNS.map((c) => c.label)]];
    for (const m of report.months) rows.push([`${MONTH_NAMES[Number(m.month.slice(5, 7)) - 1]} ${year}`, ...COLUMNS.map((c) => m[c.key])]);
    rows.push(["Total", ...COLUMNS.map((c) => report.totals[c.key])]);
    downloadCsv(`tax-report-${year}.csv`, rows);
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Tax reports"
        description={`VAT and levies collected from guests, VAT paid on approved vendor bills, and withholding tax, month by month${currency ? ` (${currency})` : ""}.`}
        actions={<button type="button" className={`${hmsButton.secondary} print:hidden`} onClick={exportCsv}><Download className="h-4 w-4" aria-hidden /> Export CSV</button>}
      />
      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end print:hidden">
        <div className="w-full sm:w-32"><HmsField id="tax-year" label="Year"><input id="tax-year" type="number" className={hmsInput} value={year} onChange={(e) => void load(Number(e.target.value))} /></HmsField></div>
        <div className="w-full sm:w-44"><HmsField id="wht-rate" label="Withholding tax rate (%)" hint="Applied to the amount before tax on approved vendor bills."><input id="wht-rate" type="number" min="0" max="100" step="0.5" disabled={!canEdit} className={`${hmsInput} tabular-nums`} value={rate} onChange={(e) => setRate(e.target.value)} /></HmsField></div>
        {canEdit ? <button type="button" className={`${hmsButton.secondary} w-full sm:w-auto`} disabled={busy} onClick={() => void saveRate()}>Save rate</button> : null}
      </div>

      <HmsCard id="tax-report" title={`${year} by month`} icon={Receipt} meaning="money" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Month</th>
                {COLUMNS.map((c) => (<th key={c.key} scope="col" className="px-3 py-3 text-right">{c.label}</th>))}
              </tr>
            </thead>
            <tbody>
              {report.months.map((m) => (
                <tr key={m.month} className="border-b border-slate-100">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">{MONTH_NAMES[Number(m.month.slice(5, 7)) - 1]}</th>
                  {COLUMNS.map((c) => (<td key={c.key} className="px-3 py-3 text-right tabular-nums text-slate-800">{fmt(m[c.key])}</td>))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                <th scope="row" className="px-4 py-3 text-left">Total</th>
                {COLUMNS.map((c) => (<td key={c.key} className="px-3 py-3 text-right tabular-nums">{fmt(report.totals[c.key])}</td>))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="px-5 py-3 text-sm text-slate-600">
          Withholding tax is worked out from the rate above; it is not posted to the books. Compare "collected" (VAT plus levies from guest bills) with the Taxes Payable credits to check the books agree.
        </p>
      </HmsCard>
    </HmsPage>
  );
}
