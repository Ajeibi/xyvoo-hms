"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountLedgerResult } from "@/lib/hms/financial-statements";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";

export function AccountsLedgerClient({
  slug,
  accountId,
  initialResult,
  currency,
}: {
  slug: string;
  accountId: string;
  initialResult: AccountLedgerResult;
  currency: string;
}) {
  const [result, setResult] = useState(initialResult);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);

  const runReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/hotel/accounts/ledger/${accountId}?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const typeLabel = result.type ? `${result.type.charAt(0).toUpperCase()}${result.type.slice(1)}` : "";

  return (
    <HmsPage>
      <Link
        href={`/hms/${slug}/accounts/chart`}
        className={`${hmsButton.quiet} -ml-2 print:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Chart of accounts
      </Link>

      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title={result.name}
        description={
          <>
            <code className="mr-2 font-mono text-sm text-slate-700">{result.code}</code>
            {typeLabel} account{currency ? ` · ${currency}` : ""}
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm print:hidden">
        <div className="w-[12rem]">
          <HmsField id="ledger-from" label="From" optional>
            <input id="ledger-from" type="date" className={hmsInput} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </HmsField>
        </div>
        <div className="w-[12rem]">
          <HmsField id="ledger-to" label="To" optional>
            <input id="ledger-to" type="date" className={hmsInput} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </HmsField>
        </div>
        <button type="button" className={hmsButton.secondary} disabled={loading} onClick={() => void runReport()}>
          {loading ? "Loading…" : "Run report"}
        </button>
      </div>

      <HmsCard
        id="account-ledger-report"
        title="Ledger entries"
        icon={BookOpen}
        meaning="money"
        flush
        className="print:border-0 print:shadow-none"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-5 py-3">Date</th>
                <th scope="col" className="px-5 py-3">Memo</th>
                <th scope="col" className="px-5 py-3 text-right">Debit</th>
                <th scope="col" className="px-5 py-3 text-right">Credit</th>
                <th scope="col" className="px-5 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-800">
                <th scope="row" colSpan={4} className="px-5 py-3 text-left">
                  Opening balance
                </th>
                <td className="px-5 py-3 text-right tabular-nums">{result.openingBalance.toFixed(2)}</td>
              </tr>
              {result.lines.length === 0 ? (
                <tr className="border-b border-slate-100">
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-slate-600">
                    No activity in this range.
                  </td>
                </tr>
              ) : (
                result.lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700">{new Date(l.entryDate).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-slate-900">
                      {l.memo}
                      {l.description ? <span className="text-slate-600"> — {l.description}</span> : null}
                      {l.reversedOf ? (
                        <span className="ml-2">
                          <HmsPill tone="amber">Reverses another entry</HmsPill>
                        </span>
                      ) : null}
                      {l.reversedBy ? (
                        <span className="ml-2">
                          <HmsPill tone="slate">Reversed</HmsPill>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{l.debit > 0 ? l.debit.toFixed(2) : "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{l.credit > 0 ? l.credit.toFixed(2) : "—"}</td>
                    <td
                      className={cn(
                        "px-5 py-3 text-right tabular-nums font-medium",
                        l.runningBalance < 0 ? "text-red-700" : "text-slate-900",
                      )}
                    >
                      {l.runningBalance.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                <th scope="row" colSpan={4} className="px-5 py-3 text-left">
                  Closing balance
                </th>
                <td className="px-5 py-3 text-right tabular-nums">{result.closingBalance.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </HmsCard>
    </HmsPage>
  );
}
