"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const STATUS_BADGE: Record<PurchaseOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-500 border-slate-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  ordered: "bg-indigo-50 text-indigo-700 border-indigo-200",
  partially_received: "bg-purple-50 text-purple-700 border-purple-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-500 border-slate-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

export function ProcurementOrdersClient({ slug, orders, currency }: { slug: string; orders: PurchaseOrderWithLines[]; currency: string }) {
  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseOrderStatus>("all");

  const filtered = useMemo(() => (statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter)), [orders, statusFilter]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === tab.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button asChild className="rounded-lg">
          <Link href={`/hms/${slug}/procurement/orders/new`}>
            <Plus className="h-4 w-4" /> New purchase order
          </Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No purchase orders in this view.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((o) => (
              <li key={o.id}>
                <Link href={`/hms/${slug}/procurement/orders/${o.id}`} className="flex items-center justify-between gap-3 px-6 py-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {o.po_number} · {o.vendor_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {o.department} · {o.lines.length} line(s)
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-medium tabular-nums text-slate-700">{formatPricingAmount(o.total, o.currency || currency)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[o.status]}`}>
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
