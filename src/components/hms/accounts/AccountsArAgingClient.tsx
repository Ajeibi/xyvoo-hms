"use client";

import { CircleAlert, Clock, FileText, Wallet } from "lucide-react";
import type { ArAgingRow } from "@/lib/hms/customer-invoices";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsStatStrip, HmsStatTile } from "@/components/hms/hms-ui";

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
  const overdueTotal = totals.overdue1to30 + totals.overdue31to60 + totals.overdue61to90 + totals.overdue90plus;

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="AR ageing"
        description="Every open, unpaid customer invoice, grouped by how overdue it is against its due date."
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {rows.length === 0 ? (
        <HmsEmptyState
          art="chart"
          meaning="money"
          title="Nothing outstanding"
          description="Every open invoice has been paid."
        />
      ) : (
        <>
          <HmsStatStrip label="Amounts owed by customers" columns={3}>
            <HmsStatTile label="Total owed to you" value={fmt(totals.total)} hint={`${rows.length} ${rows.length === 1 ? "customer" : "customers"}`} icon={Wallet} meaning="money" />
            <HmsStatTile
              label="Overdue"
              value={fmt(overdueTotal)}
              icon={Clock}
              meaning={overdueTotal > 0 ? "attention" : "money"}
              hint="Nothing past its due date"
              status={overdueTotal > 0 ? "warning" : undefined}
              statusText="Past its due date"
            />
            <HmsStatTile
              label="Over 90 days overdue"
              value={fmt(totals.overdue90plus)}
              icon={CircleAlert}
              meaning={totals.overdue90plus > 0 ? "attention" : "money"}
              hint="Nothing this late"
              status={totals.overdue90plus > 0 ? "critical" : undefined}
              statusText="Needs chasing"
            />
          </HmsStatStrip>

          <HmsCard
            id="ar-ageing-report"
            title="Unpaid invoices by customer"
            icon={FileText}
            meaning="money"
            flush
            className="print:border-0 print:shadow-none"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                  <tr>
                    <th scope="col" className="px-5 py-3">Customer</th>
                    <th scope="col" className="px-5 py-3 text-right">Current</th>
                    <th scope="col" className="px-5 py-3 text-right">1–30 days overdue</th>
                    <th scope="col" className="px-5 py-3 text-right">31–60 days overdue</th>
                    <th scope="col" className="px-5 py-3 text-right">61–90 days overdue</th>
                    <th scope="col" className="px-5 py-3 text-right">Over 90 days overdue</th>
                    <th scope="col" className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.customerId} className="border-b border-slate-100">
                      <th scope="row" className="px-5 py-3 text-left font-medium text-slate-900">{r.customerName}</th>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.current)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.overdue1to30)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-amber-800">{fmt(r.overdue31to60)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-orange-800">{fmt(r.overdue61to90)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums font-semibold text-rose-700">{fmt(r.overdue90plus)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums font-semibold text-slate-900">{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                    <th scope="row" className="px-5 py-3 text-left">Total</th>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{fmt(totals.current)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{fmt(totals.overdue1to30)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{fmt(totals.overdue31to60)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{fmt(totals.overdue61to90)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{fmt(totals.overdue90plus)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{fmt(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </HmsCard>
        </>
      )}
    </HmsPage>
  );
}
