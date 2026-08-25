"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardList,
  Package,
  PackagePlus,
  PlusCircle,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InventoryMovementWithDetails, InventoryStockLevelWithDetails } from "@/lib/hms/inventory-types";
import type { InventoryDashboardStats } from "@/lib/hms/inventory-stock";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useInventoryRealtime } from "@/hooks/useInventoryRealtime";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const MOVEMENT_LABELS: Record<InventoryMovementWithDetails["movement_type"], string> = {
  receipt: "Receipt",
  issue: "Issue",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  adjustment: "Adjustment",
  waste: "Waste",
  count_variance: "Count variance",
};

/** Movement types that reduce qty_on_hand by convention (used only for sign display fallback). */
const NEGATIVE_TYPES = new Set(["issue", "transfer_out", "waste"]);

function signedQty(m: InventoryMovementWithDetails) {
  if (m.qty > 0) return `+${m.qty}`;
  if (m.qty < 0) return `${m.qty}`;
  return NEGATIVE_TYPES.has(m.movement_type) ? `-${m.qty}` : `${m.qty}`;
}

type KpiTile = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "slate" | "amber" | "red" | "green";
};

export function InventoryDashboardClient({
  slug,
  tenantId,
  currency,
  stats,
  lowStock,
  movements,
  canAccessAllDepartments,
}: {
  slug: string;
  tenantId: string;
  currency: string;
  stats: InventoryDashboardStats;
  lowStock: InventoryStockLevelWithDetails[];
  movements: InventoryMovementWithDetails[];
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  useInventoryRealtime(tenantId, () => router.refresh());

  const tiles: KpiTile[] = [
    { icon: Package, label: "Tracked SKUs", value: stats.skuCount.toLocaleString(), tone: "slate" },
    { icon: Wallet, label: "Stock value", value: formatPricingAmount(stats.stockValue, currency), tone: "slate" },
    {
      icon: AlertTriangle,
      label: "Low-stock items",
      value: stats.lowStockCount.toLocaleString(),
      tone: stats.lowStockCount > 0 ? "amber" : "slate",
    },
    {
      icon: ClipboardList,
      label: "Pending requisitions",
      value: stats.pendingRequisitions.toLocaleString(),
      tone: stats.pendingRequisitions > 0 ? "amber" : "slate",
    },
    { icon: ArrowDownCircle, label: "Today's receipts", value: stats.todayReceipts.toLocaleString(), tone: "green" },
    { icon: ArrowUpCircle, label: "Today's issues", value: stats.todayIssues.toLocaleString(), tone: "slate" },
    { icon: Trash2, label: "Today's waste", value: stats.todayWaste.toLocaleString(), tone: stats.todayWaste > 0 ? "red" : "slate" },
  ];

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-center gap-1.5">
        <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
        <SettingsSectionInfo
          title="Inventory"
          text="Live view of stock levels, today's activity, and reorder alerts across every store. Use the buttons below to jump straight into receiving, requisitions, or waste."
        />
      </div>
      <p className="mt-0.5 text-sm text-slate-500">
        Stock levels, movements, and reorder status across every store location.
      </p>

      <div className="mt-4 mb-4 flex flex-wrap gap-3">
        {canAccessAllDepartments ? (
          <Button asChild className="h-11 rounded-xl px-5 font-semibold shadow-sm">
            <Link href={`/hms/${slug}/settings#inventory-setup`}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New item
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" className="h-11 rounded-xl px-5 font-semibold shadow-sm">
          <Link href={`/hms/${slug}/inventory/receiving`}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Receive stock
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-xl px-5 font-semibold shadow-sm">
          <Link href={`/hms/${slug}/inventory/requisitions`}>
            <ArrowUpCircle className="mr-2 h-4 w-4" />
            New requisition
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-xl px-5 font-semibold shadow-sm">
          <Link href={`/hms/${slug}/inventory/waste`}>
            <Trash2 className="mr-2 h-4 w-4" />
            Record waste
          </Link>
        </Button>
      </div>

      <InventorySubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <KpiCard key={tile.label} {...tile} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Low stock</h2>
            <span className="text-xs text-slate-400">{lowStock.length} item{lowStock.length === 1 ? "" : "s"}</span>
          </div>
          {lowStock.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No items are currently below their reorder point.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-2.5">Item</th>
                    <th className="px-5 py-2.5">Location</th>
                    <th className="px-5 py-2.5 text-right">On hand</th>
                    <th className="px-5 py-2.5 text-right">Reorder point</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((level) => (
                    <tr key={level.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-slate-800">{level.item_name}</div>
                        <div className="text-xs text-slate-400">{level.item_sku}</div>
                      </td>
                      <td className="px-5 py-2.5 text-slate-600">{level.location_name}</td>
                      <td className="px-5 py-2.5 text-right font-medium text-amber-600">
                        {level.qty_on_hand} {level.unit_of_measure}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-500">{level.reorder_point}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent stock movements</h2>
            <span className="text-xs text-slate-400">
              {movements.length} recent
            </span>
          </div>
          {movements.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No stock movements yet.</p>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-2.5">Type</th>
                    <th className="px-5 py-2.5">Item</th>
                    <th className="px-5 py-2.5 text-right">Qty</th>
                    <th className="px-5 py-2.5">Location</th>
                    <th className="px-5 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-2.5 text-slate-700">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</td>
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-slate-800">{m.item_name}</div>
                        <div className="text-xs text-slate-400">{m.item_sku}</div>
                      </td>
                      <td
                        className={`px-5 py-2.5 text-right font-medium ${
                          m.qty > 0 ? "text-emerald-600" : m.qty < 0 ? "text-red-500" : "text-slate-500"
                        }`}
                      >
                        {signedQty(m)} {m.unit_of_measure}
                      </td>
                      <td className="px-5 py-2.5 text-slate-600">
                        {m.location_name}
                        {m.related_location_name ? (
                          <span className="text-xs text-slate-400"> → {m.related_location_name}</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-2.5 text-slate-500">{formatWhen(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone }: KpiTile) {
  const toneClasses: Record<KpiTile["tone"], string> = {
    slate: "bg-slate-50 text-slate-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    green: "bg-emerald-50 text-emerald-600",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
