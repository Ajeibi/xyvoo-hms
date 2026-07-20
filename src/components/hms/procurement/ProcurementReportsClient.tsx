"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function SpendTable({ title, rows, currency }: { title: string; rows: { label: string; total: number; orderCount: number }[]; currency: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-6 text-sm text-slate-500">No committed spend yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between px-6 py-3 text-sm">
              <span className="text-slate-800">
                {r.label} <span className="text-xs text-slate-400">({r.orderCount} order{r.orderCount === 1 ? "" : "s"})</span>
              </span>
              <span className="tabular-nums font-medium text-slate-700">{formatPricingAmount(r.total, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
    <div className="mt-6 space-y-6">
      <div className="flex justify-end">
        <Button type="button" variant="outline" className="rounded-lg" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SpendTable
          title="Spend by vendor"
          rows={spendByVendor.map((v) => ({ label: v.vendorName, total: v.total, orderCount: v.orderCount }))}
          currency={currency}
        />
        <SpendTable
          title="Spend by department"
          rows={spendByDepartment.map((d) => ({ label: d.department, total: d.total, orderCount: d.orderCount }))}
          currency={currency}
        />
        <SpendTable
          title="Spend by category"
          rows={spendByCategory.map((c) => ({ label: c.categoryName, total: c.total, orderCount: c.orderCount }))}
          currency={currency}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Vendor performance</h2>
        </div>
        {vendorPerformance.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">No vendors recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3">Vendor</th>
                  <th className="px-6 py-3">Orders</th>
                  <th className="px-6 py-3">Spend</th>
                  <th className="px-6 py-3">On-time</th>
                  <th className="px-6 py-3">Avg quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendorPerformance.map((v) => (
                  <tr key={v.vendorId}>
                    <td className="px-6 py-3 font-medium text-slate-800">{v.vendorName}</td>
                    <td className="px-6 py-3 tabular-nums text-slate-600">{v.totalOrders}</td>
                    <td className="px-6 py-3 tabular-nums text-slate-600">{formatPricingAmount(v.totalSpend, currency)}</td>
                    <td className="px-6 py-3 tabular-nums text-slate-600">{v.onTimeRate === null ? "—" : `${Math.round(v.onTimeRate * 100)}%`}</td>
                    <td className="px-6 py-3 tabular-nums text-slate-600">{v.avgQualityScore === null ? "—" : v.avgQualityScore.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
