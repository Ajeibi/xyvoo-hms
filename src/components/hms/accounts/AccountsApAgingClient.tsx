"use client";

import { CircleAlert, Clock, Receipt, Wallet } from "lucide-react";
import type { ApAgingRow } from "@/lib/hms/vendor-bill-payments";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsStatStrip, HmsStatTile } from "@/components/hms/hms-ui";

function fmt(n: number) {
  return n.toFixed(2);
}

export function AccountsApAgingClient({
  slug,
  rows,
  canAccessAllDepartments,
}: {
  slug: string;
  rows: ApAgingRow[];
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
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="AP ageing"
        description="Every approved, unpaid supplier bill, grouped by how overdue it is against its due date."
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {rows.length === 0 ? (
        <HmsEmptyState
          art="chart"
          meaning="money"
          title="Nothing outstanding"
          description="Every approved bill has been paid."
        />
      ) : (
        <>
          <HmsStatStrip label="Amounts owed to suppliers" columns={3}>
            <HmsStatTile label="Total owed" value={fmt(totals.total)} hint={`${rows.length} ${rows.length === 1 ? "supplier" : "suppliers"}`} icon={Wallet} meaning="money" />
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
              statusText="Needs paying first"
            />
          </HmsStatStrip>

          <HmsCard
            id="ap-ageing-report"
            title="Unpaid bills by supplier"
            icon={Receipt}
            meaning="money"
            flush
            className="print:border-0 print:shadow-none"
          >
            <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {rows.map((r) => (
                <li key={r.vendorId} className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{r.vendorName}</p>
                    <p className="shrink-0 font-semibold tabular-nums text-slate-900">{fmt(r.total)}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-slate-600">Current</dt>
                      <dd className="mt-0.5 tabular-nums text-slate-900">{fmt(r.current)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-600">1–30 days overdue</dt>
                      <dd className="mt-0.5 tabular-nums text-slate-900">{fmt(r.overdue1to30)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-600">31–60 days overdue</dt>
                      <dd className="mt-0.5 tabular-nums text-amber-800">{fmt(r.overdue31to60)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-600">61–90 days overdue</dt>
                      <dd className="mt-0.5 tabular-nums text-orange-800">{fmt(r.overdue61to90)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs font-medium text-slate-600">Over 90 days overdue</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-rose-700">{fmt(r.overdue90plus)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-slate-50 p-4 font-semibold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">{fmt(totals.total)}</span>
              </li>
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-190 text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                  <tr>
                    <th scope="col" className="px-5 py-3">Supplier</th>
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
                    <tr key={r.vendorId} className="border-b border-slate-100">
                      <th scope="row" className="px-5 py-3 text-left font-medium text-slate-900">{r.vendorName}</th>
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
            </>
          </HmsCard>
        </>
      )}
    </HmsPage>
  );
}
