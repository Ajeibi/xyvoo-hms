"use client";

import { cn } from "@/lib/utils";
import type { ArAgingRow } from "@/lib/hms/customer-invoices";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

function fmt(n: number) {
  return n.toFixed(2);
}

export function AccountsArAgingClient({
  slug,
  rows,
  canAccessAllDepartments,
}: {
  slug: string;
  rows: ArAgingRow[];
  canAccessAllDepartments: boolean;
}) {
  const totals = rows.reduce(
    (acc, r) => ({
      current: acc.current + r.current,
      overdue1to30: acc.overdue1to30 + r.overdue1to30,
      overdue31to60: acc.overdue31to60 + r.overdue31to60,
      overdue61to90: acc.overdue61to90 + r.overdue61to90,
      overdue90plus: acc.overdue90plus + r.overdue90plus,
      total: acc.total + r.total,
    }),
    { current: 0, overdue1to30: 0, overdue31to60: 0, overdue61to90: 0, overdue90plus: 0, total: 0 },
  );

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">AR aging</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Every open, unpaid customer invoice, bucketed by how overdue it is against its due date.
      </p>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Nothing outstanding — every open invoice has been received.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Current</th>
                  <th className="px-4 py-3 text-right">1–30 days</th>
                  <th className="px-4 py-3 text-right">31–60 days</th>
                  <th className="px-4 py-3 text-right">61–90 days</th>
                  <th className="px-4 py-3 text-right">90+ days</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customerId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{r.customerName}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.current)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.overdue1to30)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-amber-700">{fmt(r.overdue31to60)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-orange-700">{fmt(r.overdue61to90)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums font-semibold text-red-700">
                      {fmt(r.overdue90plus)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={cn("border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900")}>
                  <td className="px-4 py-2.5">Total</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmt(totals.current)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmt(totals.overdue1to30)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmt(totals.overdue31to60)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmt(totals.overdue61to90)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmt(totals.overdue90plus)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmt(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
