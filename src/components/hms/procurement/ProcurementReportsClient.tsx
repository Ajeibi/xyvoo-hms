"use client";

import { BarChart3, Building2, Download, Tags, Truck } from "lucide-react";
import { HmsCard, HmsEmptyState, hmsButton } from "@/components/hms/hms-ui";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { SpendByCategory, SpendByDepartment, SpendByVendor, VendorPerformanceReportRow } from "@/lib/hms/procurement-reports";

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

function SpendTable({
  id,
  title,
  labelHeading,
  icon,
  rows,
  currency,
}: {
  id: string;
  title: string;
  labelHeading: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: { label: string; total: number; orderCount: number }[];
  currency: string;
}) {
  const totalSpend = rows.reduce((sum, r) => sum + r.total, 0);
  const totalOrders = rows.reduce((sum, r) => sum + r.orderCount, 0);
  return (
    <HmsCard id={id} title={title} icon={icon} meaning="money" flush className="print:border-0 print:shadow-none">
      {rows.length === 0 ? (
        <HmsEmptyState bare art="chart" meaning="money" title="No spend yet" description="No committed spend yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-sm font-medium text-slate-600">
                <th scope="col" className="px-5 py-3 font-medium">{labelHeading}</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Orders</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-5 py-3 text-slate-900">{r.label}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{r.orderCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-900">{formatPricingAmount(r.total, currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                <th scope="row" className="px-5 py-3 text-left">Total</th>
                <td className="px-3 py-3 text-right tabular-nums">{totalOrders}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatPricingAmount(totalSpend, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </HmsCard>
  );
}

export function ProcurementReportsClient({
  spendByVendor,
  spendByDepartment,
  spendByCategory,
  vendorPerformance,
  currency,
}: {
  spendByVendor: SpendByVendor[];
  spendByDepartment: SpendByDepartment[];
  spendByCategory: SpendByCategory[];
  vendorPerformance: VendorPerformanceReportRow[];
  currency: string;
}) {
  const exportCsv = () => {
    downloadCsv("procurement-spend-by-vendor.csv", [
      ["Vendor", "Orders", "Total"],
      ...spendByVendor.map((v) => [v.vendorName, v.orderCount, v.total]),
    ]);
    downloadCsv("procurement-spend-by-department.csv", [
      ["Department", "Orders", "Total"],
      ...spendByDepartment.map((d) => [d.department, d.orderCount, d.total]),
    ]);
    downloadCsv("procurement-spend-by-category.csv", [
      ["Category", "Orders", "Total"],
      ...spendByCategory.map((c) => [c.categoryName, c.orderCount, c.total]),
    ]);
    downloadCsv("procurement-vendor-performance.csv", [
      ["Vendor", "Status", "Orders", "Total spend", "On-time rate", "Avg quality score"],
      ...vendorPerformance.map((v) => [
        v.vendorName,
        v.status,
        v.totalOrders,
        v.totalSpend,
        v.onTimeRate === null ? "" : Math.round(v.onTimeRate * 100),
        v.avgQualityScore === null ? "" : v.avgQualityScore.toFixed(1),
      ]),
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end print:hidden">
        <button type="button" className={hmsButton.secondary} onClick={exportCsv}>
          <Download className="h-4 w-4" aria-hidden /> Export CSV
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SpendTable
          id="procurement-spend-vendor"
          title="Spend by vendor"
          labelHeading="Vendor"
          icon={Truck}
          rows={spendByVendor.map((v) => ({ label: v.vendorName, total: v.total, orderCount: v.orderCount }))}
          currency={currency}
        />
        <SpendTable
          id="procurement-spend-department"
          title="Spend by department"
          labelHeading="Department"
          icon={Building2}
          rows={spendByDepartment.map((d) => ({ label: d.department, total: d.total, orderCount: d.orderCount }))}
          currency={currency}
        />
        <SpendTable
          id="procurement-spend-category"
          title="Spend by category"
          labelHeading="Category"
          icon={Tags}
          rows={spendByCategory.map((c) => ({ label: c.categoryName, total: c.total, orderCount: c.orderCount }))}
          currency={currency}
        />
      </div>

      <HmsCard id="procurement-vendor-performance" title="Vendor performance" icon={BarChart3} meaning="stock" flush className="print:border-0 print:shadow-none">
        {vendorPerformance.length === 0 ? (
          <HmsEmptyState bare art="chart" meaning="stock" title="No vendors yet" description="No vendors recorded yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-sm font-medium text-slate-600">
                  <th scope="col" className="px-5 py-3 font-medium sm:px-6">Vendor</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Orders</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Spend</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">On time</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium sm:px-6">Average quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendorPerformance.map((v) => (
                  <tr key={v.vendorId}>
                    <td className="px-5 py-3 font-medium text-slate-900 sm:px-6">{v.vendorName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{v.totalOrders}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatPricingAmount(v.totalSpend, currency)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{v.onTimeRate === null ? "—" : `${Math.round(v.onTimeRate * 100)}%`}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700 sm:px-6">{v.avgQualityScore === null ? "—" : v.avgQualityScore.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>
    </div>
  );
}
