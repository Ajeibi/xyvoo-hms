"use client";

import Link from "next/link";
import { ClipboardList, PackageSearch, Plus, ShoppingCart, Truck, Users, Wallet } from "lucide-react";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { ReorderSuggestion } from "@/lib/hms/inventory-stock";
import type { ProcurementDashboardStats, PurchaseOrderWithLines, SourceableRequisitionLine } from "@/lib/hms/procurement-types";
import { ProcurementSubNav } from "@/components/hms/procurement/ProcurementSubNav";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile, hmsButton } from "@/components/hms/hms-ui";
import type { HmsMeaning } from "@/components/hms/meaning";

type KpiTile = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  meaning: HmsMeaning;
  status?: "warning" | "critical";
  statusText?: string;
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
      meaning: "team",
      status: stats.requisitionsAwaitingSourcing > 0 ? "warning" : undefined,
      statusText: "Waiting on Procurement",
    },
    {
      icon: ShoppingCart,
      label: "POs pending approval",
      value: stats.ordersPendingApproval.toLocaleString(),
      meaning: "guests",
      status: stats.ordersPendingApproval > 0 ? "warning" : undefined,
      statusText: "Waiting for approval",
    },
    {
      icon: Truck,
      label: "Overdue deliveries",
      value: stats.ordersOverdue.toLocaleString(),
      meaning: "attention",
      status: stats.ordersOverdue > 0 ? "critical" : undefined,
      statusText: "Chase these suppliers",
    },
    { icon: PackageSearch, label: "Open purchase orders", value: stats.openOrders.toLocaleString(), meaning: "stock" },
    {
      icon: Wallet,
      label: "Budget burn (current period)",
      value: stats.budgetBurnPercent === null ? "No budgets set" : `${stats.budgetBurnPercent}%`,
      meaning: "money",
      status: stats.budgetBurnPercent !== null && stats.budgetBurnPercent >= 90 ? "critical" : undefined,
      statusText: "90% or more of budget used",
    },
    { icon: Users, label: "Active vendors", value: stats.activeVendors.toLocaleString(), meaning: "rooms" },
  ];

  const linkClass = "text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded";

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Procurement"
        meaning="stock"
        title="Procurement"
        description="Source against approved requisitions, manage vendors, and control every naira of spend before it leaves the building."
        actions={
          <Link href={`/hms/${slug}/procurement/orders/new`} className={hmsButton.primary}>
            <Plus className="h-4 w-4" aria-hidden />
            New purchase order
          </Link>
        }
      />

      <ProcurementSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsStatStrip label="Procurement at a glance" columns={3}>
        {tiles.map((tile) => (
          <HmsStatTile key={tile.label} {...tile} />
        ))}
      </HmsStatStrip>

      <div className="grid gap-6 lg:grid-cols-2">
        <HmsCard
          id="procurement-ready-to-source"
          title="Ready to source"
          description="Approved requisitions waiting on Procurement."
          icon={ClipboardList}
          meaning="team"
          flush
          actions={
            <Link href={`/hms/${slug}/procurement/requisitions`} className={linkClass}>
              View all
            </Link>
          }
        >
          {sourceableLines.length === 0 ? (
            <HmsEmptyState bare art="page" meaning="team" title="Nothing to source" description="No approved requisitions are waiting on Procurement right now." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sourceableLines.map((l) => (
                <li key={l.requisitionLineId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{l.itemName}</p>
                    <p className="text-sm text-slate-600">
                      {l.requisitionNumber} · {l.requestingDepartment}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-slate-700">
                    {l.qtyRemaining} {l.unitOfMeasure}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </HmsCard>

        <HmsCard
          id="procurement-reorder-alerts"
          title="Reorder alerts from Inventory"
          description="Auto-suggested from items at or below their reorder point."
          icon={PackageSearch}
          meaning="stock"
          flush
        >
          {reorderSuggestions.length === 0 ? (
            <HmsEmptyState bare art="box" meaning="stock" title="Stock levels look fine" description="Nothing at or below its reorder point right now." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {reorderSuggestions.map((s) => (
                <li key={`${s.itemId}-${s.locationId}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{s.itemName}</p>
                    <p className="text-sm text-slate-600">
                      {s.locationName} · {s.qtyOnHand} {s.unitOfMeasure} on hand
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <HmsPill tone="amber">
                      Suggest {s.suggestedQty} {s.unitOfMeasure}
                    </HmsPill>
                    <Link
                      href={{
                        pathname: `/hms/${slug}/procurement/orders/new`,
                        query: {
                          reorderItemId: s.itemId,
                          reorderItemName: s.itemName,
                          reorderSku: s.itemSku,
                          reorderQty: s.suggestedQty,
                          reorderUnitCost: s.unitCost,
                        },
                      }}
                      className={hmsButton.quiet}
                    >
                      Create PO
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </HmsCard>
      </div>

      <HmsCard
        id="procurement-awaiting-approval"
        title="Awaiting your approval"
        description="Purchase orders that need sign-off before they can be sent."
        icon={ShoppingCart}
        meaning="team"
        flush
        actions={
          <Link href={`/hms/${slug}/procurement/orders`} className={linkClass}>
            View all orders
          </Link>
        }
      >
        {pendingOrders.length === 0 ? (
          <HmsEmptyState bare art="page" meaning="team" title="All caught up" description="No purchase orders are waiting on approval." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pendingOrders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/hms/${slug}/procurement/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">
                      {o.po_number} · {o.vendor_name}
                    </span>
                    <span className="block text-sm text-slate-600">{o.department}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-slate-900">{formatPricingAmount(o.total, currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </HmsCard>
    </HmsPage>
  );
}
