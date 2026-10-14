"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, ShoppingCart } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { HmsFilterChips, HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { PurchaseOrderStatus, PurchaseOrderWithLines } from "@/lib/hms/procurement-types";

const STATUS_TABS: { key: "all" | PurchaseOrderStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending_approval", label: "Pending approval" },
  { key: "approved", label: "Approved" },
  { key: "ordered", label: "Ordered" },
  { key: "partially_received", label: "Partially received" },
  { key: "received", label: "Received" },
  { key: "closed", label: "Closed" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_PILL: Record<PurchaseOrderStatus, { label: string; tone: "slate" | "green" | "amber" | "red" | "blue" }> = {
  draft: { label: "Draft", tone: "slate" },
  pending_approval: { label: "Waiting for approval", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  ordered: { label: "Ordered", tone: "blue" },
  partially_received: { label: "Partly received", tone: "blue" },
  received: { label: "Received", tone: "green" },
  closed: { label: "Closed", tone: "slate" },
  rejected: { label: "Rejected", tone: "red" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export function ProcurementOrdersClient({ slug, orders, currency }: { slug: string; orders: PurchaseOrderWithLines[]; currency: string }) {
  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseOrderStatus>("all");

  const filtered = useMemo(() => (statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter)), [orders, statusFilter]);

  const filterOptions = useMemo(
    () =>
      STATUS_TABS.map((tab) => ({
        value: tab.key,
        label: tab.label,
        count: tab.key === "all" ? orders.length : orders.filter((o) => o.status === tab.key).length,
      })),
    [orders],
  );

  const newOrderLink = (
    <Link href={`/hms/${slug}/procurement/orders/new`} className={hmsButton.primary}>
      <Plus className="h-4 w-4" aria-hidden /> New purchase order
    </Link>
  );

  return (
    <div className="space-y-6">
      <HmsSectionIntro
        id="procurement-orders"
        title="Every purchase order in one place"
        meaning="stock"
        art="truck"
        points={[
          "Follow each order from approval to delivery.",
          "Use the filters to find orders waiting for approval or still to arrive.",
          "Open an order to approve it, mark it as ordered, or record the invoice.",
        ]}
      />

      <HmsFilterChips label="Filter purchase orders by status" options={filterOptions} value={statusFilter} onChange={setStatusFilter} meaning="stock" />

      <HmsCard
        id="procurement-orders-list"
        title="Purchase orders"
        description={`${filtered.length} ${filtered.length === 1 ? "order" : "orders"} in this view`}
        icon={ShoppingCart}
        meaning="stock"
        flush
        actions={newOrderLink}
      >
        {filtered.length === 0 ? (
          <HmsEmptyState
            bare
            art="truck"
            meaning="stock"
            title={orders.length === 0 ? "No purchase orders yet" : "No purchase orders in this view"}
            description={orders.length === 0 ? "Raise your first purchase order from an approved requisition or as a one-off." : "Try another filter to see more orders."}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((o) => {
              const status = STATUS_PILL[o.status];
              return (
                <li key={o.id}>
                  <Link
                    href={`/hms/${slug}/procurement/orders/${o.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-6"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {o.po_number} · {o.vendor_name}
                      </span>
                      <span className="block text-sm text-slate-600">
                        {o.department} · {o.lines.length} {o.lines.length === 1 ? "line" : "lines"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                      <span className="text-sm font-medium tabular-nums text-slate-900">{formatPricingAmount(o.total, o.currency || currency)}</span>
                      <HmsPill tone={status.tone}>{status.label}</HmsPill>
                      <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </HmsCard>
    </div>
  );
}
