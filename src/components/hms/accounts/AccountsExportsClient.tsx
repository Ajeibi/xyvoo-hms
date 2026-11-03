"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const link = (slug: string, params: Record<string, string>) => `/api/hotel/accounts/export?${new URLSearchParams({ slug, ...params })}`;

export function AccountsExportsClient({ slug, today, canAccessAllDepartments }: { slug: string; today: string; canAccessAllDepartments: boolean }) {
  const [asOf, setAsOf] = useState(today);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);

  return (
    <HmsPage>
      <HmsPageHeader eyebrow="Accounts" meaning="money" title="Exports" description="Take the books out as CSV or Excel, or in a layout your accountant's package can import." />
      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsCard id="export-trial-balance" title="Trial balance" icon={FileSpreadsheet} meaning="money">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48"><HmsField id="ex-asof" label="As of"><input id="ex-asof" type="date" className={hmsInput} value={asOf} onChange={(e) => setAsOf(e.target.value)} /></HmsField></div>
          <a className={hmsButton.secondary} href={link(slug, { type: "trial-balance", format: "csv", asOfDate: asOf })}><Download className="h-4 w-4" aria-hidden /> CSV</a>
          <a className={hmsButton.secondary} href={link(slug, { type: "trial-balance", format: "xlsx", asOfDate: asOf })}><Download className="h-4 w-4" aria-hidden /> Excel</a>
        </div>
      </HmsCard>

      <HmsCard id="export-journal" title="Journal entries" icon={FileSpreadsheet} meaning="money" description="Every line of every entry dated in the range.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48"><HmsField id="ex-from" label="From"><input id="ex-from" type="date" className={hmsInput} value={from} onChange={(e) => setFrom(e.target.value)} /></HmsField></div>
          <div className="w-48"><HmsField id="ex-to" label="To"><input id="ex-to" type="date" className={hmsInput} value={to} onChange={(e) => setTo(e.target.value)} /></HmsField></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <a className={hmsButton.secondary} href={link(slug, { type: "journal", format: "csv", dateFrom: from, dateTo: to })}><Download className="h-4 w-4" aria-hidden /> CSV</a>
          <a className={hmsButton.secondary} href={link(slug, { type: "journal", format: "xlsx", dateFrom: from, dateTo: to })}><Download className="h-4 w-4" aria-hidden /> Excel</a>
          <a className={hmsButton.secondary} href={link(slug, { type: "journal", format: "quickbooks", dateFrom: from, dateTo: to })}><Download className="h-4 w-4" aria-hidden /> QuickBooks Online</a>
          <a className={hmsButton.secondary} href={link(slug, { type: "journal", format: "sage", dateFrom: from, dateTo: to })}><Download className="h-4 w-4" aria-hidden /> Sage 50</a>
        </div>
        <p className="mt-3 text-sm text-slate-600">The QuickBooks file follows the Online journal-entry CSV layout and the Sage file the Sage 50 journal import layout. Account names or codes must already exist in that package, so check its import preview before you finish.</p>
      </HmsCard>
    </HmsPage>
  );
}
