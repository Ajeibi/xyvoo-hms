"use client";

import Link from "next/link";
import { AlertTriangle, ClipboardList, PackageSearch, ShoppingCart, Truck, Wallet } from "lucide-react";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { ReorderSuggestion } from "@/lib/hms/inventory-stock";
import type { ProcurementDashboardStats, PurchaseOrderWithLines, SourceableRequisitionLine } from "@/lib/hms/procurement-types";
import { ProcurementSubNav } from "@/components/hms/procurement/ProcurementSubNav";
import { Button } from "@/components/ui/button";

type KpiTile = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "slate" | "amber" | "red" | "green";
};

const TONE_CLASSES: Record<KpiTile["tone"], string> = {
  slate: "text-slate-900",
  amber: "text-amber-600",
  red: "text-red-600",
  green: "text-emerald-600",
};

export function ProcurementDashboardClient({
  slug,
  currency,
  stats,
  reorderSuggestions,
  sourceableLines,
  pendingOrders,
  canAccessAllDepartments,
}: {
  slug: string;
  currency: string;
  stats: ProcurementDashboardStats;
  reorderSuggestions: ReorderSuggestion[];
  sourceableLines: SourceableRequisitionLine[];
  pendingOrders: PurchaseOrderWithLines[];
  canAccessAllDepartments: boolean;
}) {
  const tiles: KpiTile[] = [
    {
      icon: ClipboardList,
      label: "Requisitions awaiting sourcing",
      value: stats.requisitionsAwaitingSourcing.toLocaleString(),
      tone: stats.requisitionsAwaitingSourcing > 0 ? "amber" : "slate",
    },
    {
      icon: ShoppingCart,
      label: "POs pending approval",
      value: stats.ordersPendingApproval.toLocaleString(),
      tone: stats.ordersPendingApproval > 0 ? "amber" : "slate",
    },
    {
      icon: Truck,
      label: "Overdue deliveries",
      value: stats.ordersOverdue.toLocaleString(),
      tone: stats.ordersOverdue > 0 ? "red" : "slate",
    },
    { icon: PackageSearch, label: "Open purchase orders", value: stats.openOrders.toLocaleString(), tone: "slate" },
    {
      icon: Wallet,
      label: "Budget burn (current period)",
      value: stats.budgetBurnPercent === null ? "No budgets set" : `${stats.budgetBurnPercent}%`,
      tone: stats.budgetBurnPercent !== null && stats.budgetBurnPercent >= 90 ? "red" : "slate",
    },
    { icon: AlertTriangle, label: "Active vendors", value: stats.activeVendors.toLocaleString(), tone: "slate" },
  ];

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Procurement</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Source against approved requisitions, manage vendors, and control every naira of spend before it leaves the building.
          </p>
        </div>
        <Button asChild className="h-11 rounded-xl px-5 font-semibold shadow-sm">
          <Link href={`/hms/${slug}/procurement/orders/new`}>New purchase order</Link>
        </Button>
      </div>

      <ProcurementSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
              <tile.icon className="h-3.5 w-3.5" />
              {tile.label}
            </div>
            <p className={`mt-3 text-2xl font-semibold ${TONE_CLASSES[tile.tone]}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Ready to source</h2>
            <Link href={`/hms/${slug}/procurement/requisitions`} className="text-xs font-medium text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          {sourceableLines.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">No approved requisitions are waiting on Procurement right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sourceableLines.map((l) => (
                <li key={l.requisitionLineId} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{l.itemName}</p>
                    <p className="text-xs text-slate-400">
                      {l.requisitionNumber} · {l.requestingDepartment}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {l.qtyRemaining} {l.unitOfMeasure}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Reorder alerts from Inventory</h2>
            <span className="text-xs text-slate-400">Auto-suggested</span>
          </div>
          {reorderSuggestions.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">Nothing at or below its reorder point right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {reorderSuggestions.map((s) => (
                <li key={`${s.itemId}-${s.locationId}`} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{s.itemName}</p>
                    <p className="text-xs text-slate-400">
                      {s.locationName} · {s.qtyOnHand} {s.unitOfMeasure} on hand
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-amber-600">
                    Suggest {s.suggestedQty} {s.unitOfMeasure}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Awaiting your approval</h2>
          <Link href={`/hms/${slug}/procurement/orders`} className="text-xs font-medium text-blue-600 hover:underline">
            View all orders
          </Link>
        </div>
        {pendingOrders.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No purchase orders are waiting on approval.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pendingOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                <Link href={`/hms/${slug}/procurement/orders/${o.id}`} className="min-w-0 hover:underline">
                  <p className="truncate font-medium text-slate-800">
                    {o.po_number} · {o.vendor_name}
                  </p>
                  <p className="text-xs text-slate-400">{o.department}</p>
                </Link>
                <span className="shrink-0 text-xs font-medium tabular-nums text-slate-700">{formatPricingAmount(o.total, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
