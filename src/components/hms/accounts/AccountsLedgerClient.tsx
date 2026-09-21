"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountLedgerResult } from "@/lib/hms/financial-statements";

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

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <Link href={`/hms/${slug}/accounts/chart`} className="text-sm text-blue-600 hover:underline">
        ← Chart of accounts
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">
        <code className="mr-2 font-mono text-base text-slate-400">{result.code}</code>
        {result.name}
      </h1>
      <p className="mt-0.5 text-sm capitalize text-slate-500">
        {result.type} account{currency ? ` · ${currency}` : ""}
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">From (optional)</p>
          <Input type="date" className="h-10 w-[11rem]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">To (optional)</p>
          <Input type="date" className="h-10 w-[11rem]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void runReport()}>
          {loading ? "Loading…" : "Run report"}
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Memo</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50/70">
              <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">
                Opening balance
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-xs font-semibold text-slate-500">
                {result.openingBalance.toFixed(2)}
              </td>
            </tr>
            {result.lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                  No activity in this range.
                </td>
              </tr>
            ) : (
              result.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-600">{new Date(l.entryDate).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    {l.memo}
                    {l.description ? <span className="text-slate-400"> — {l.description}</span> : null}
                    {l.reversedOf ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        Reverses another entry
                      </span>
                    ) : null}
                    {l.reversedBy ? (
                      <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        Reversed
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{l.debit > 0 ? l.debit.toFixed(2) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{l.credit > 0 ? l.credit.toFixed(2) : "—"}</td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right tabular-nums font-medium",
                      l.runningBalance < 0 ? "text-red-600" : "text-slate-900",
                    )}
                  >
                    {l.runningBalance.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td colSpan={4} className="px-4 py-2.5">
                Closing balance
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{result.closingBalance.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
