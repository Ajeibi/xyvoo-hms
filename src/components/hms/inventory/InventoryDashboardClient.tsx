"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  ClipboardList,
  Package,
  PackagePlus,
  PlusCircle,
  Trash2,
  Wallet,
} from "lucide-react";
import type { InventoryMovementWithDetails, InventoryStockLevelWithDetails } from "@/lib/hms/inventory-types";
import type { InventoryDashboardStats } from "@/lib/hms/inventory-stock";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useInventoryRealtime } from "@/hooks/useInventoryRealtime";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { HmsStatTile } from "@/components/hms/dashboard-tiles";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, hmsButton } from "@/components/hms/hms-ui";
import type { HmsMeaning } from "@/components/hms/meaning";

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

const MOVEMENT_TONES: Record<InventoryMovementWithDetails["movement_type"], "slate" | "green" | "amber" | "red" | "blue"> = {
  receipt: "green",
  issue: "blue",
  transfer_out: "blue",
  transfer_in: "green",
  adjustment: "slate",
  waste: "red",
  count_variance: "amber",
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
  meaning: HmsMeaning;
  status?: "warning" | "critical";
};

const TH = "px-5 py-3 font-medium";

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
    { icon: Package, label: "Tracked SKUs", value: stats.skuCount.toLocaleString(), meaning: "stock" },
    { icon: Wallet, label: "Stock value", value: formatPricingAmount(stats.stockValue, currency), meaning: "money" },
    {
      icon: AlertTriangle,
      label: "Low-stock items",
      value: stats.lowStockCount.toLocaleString(),
      meaning: "attention",
      status: stats.lowStockCount > 0 ? "warning" : undefined,
    },
    {
      icon: ClipboardList,
      label: "Pending requisitions",
      value: stats.pendingRequisitions.toLocaleString(),
      meaning: "team",
      status: stats.pendingRequisitions > 0 ? "warning" : undefined,
    },
    { icon: ArrowDownCircle, label: "Today's receipts", value: stats.todayReceipts.toLocaleString(), meaning: "stock" },
    { icon: ArrowUpCircle, label: "Today's issues", value: stats.todayIssues.toLocaleString(), meaning: "rooms" },
    { icon: Trash2, label: "Today's waste", value: stats.todayWaste.toLocaleString(), meaning: "food", status: stats.todayWaste > 0 ? "critical" : undefined },
  ];

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Inventory"
        meaning="stock"
        title="Inventory"
        description="Stock levels, today's activity and reorder alerts across every store."
        actions={
          <>
            {canAccessAllDepartments ? (
              <Link href={`/hms/${slug}/settings#inventory-setup`} className={hmsButton.primary}>
                <PlusCircle className="h-4 w-4" aria-hidden />
                New item
              </Link>
            ) : null}
            <Link href={`/hms/${slug}/inventory/receiving`} className={hmsButton.secondary}>
              <PackagePlus className="h-4 w-4" aria-hidden />
              Receive stock
            </Link>
            <Link href={`/hms/${slug}/inventory/requisitions`} className={hmsButton.secondary}>
              <ArrowUpCircle className="h-4 w-4" aria-hidden />
              New requisition
            </Link>
            <Link href={`/hms/${slug}/inventory/waste`} className={hmsButton.secondary}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Record waste
            </Link>
          </>
        }
      />

      <InventorySubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsStatStrip label="Inventory at a glance">
        {tiles.map((tile) => (
          <HmsStatTile key={tile.label} {...tile} statusText={tile.status === "critical" ? "Waste recorded today" : undefined} />
        ))}
      </HmsStatStrip>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <HmsCard
          id="inventory-low-stock"
          title="Low stock"
          description={`${lowStock.length} item${lowStock.length === 1 ? "" : "s"} at or below the reorder point`}
          icon={AlertTriangle}
          meaning="attention"
          flush
        >
          {lowStock.length === 0 ? (
            <HmsEmptyState
              bare
              art="box"
              meaning="stock"
              title="Nothing is running low"
              description="No items are currently below their reorder point."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-sm text-slate-600">
                    <th className={TH}>Item</th>
                    <th className={TH}>Location</th>
                    <th className={`${TH} text-right`}>On hand</th>
                    <th className={`${TH} text-right`}>Reorder point</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((level) => (
                    <tr key={level.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{level.item_name}</div>
                        <div className="text-xs text-slate-600">{level.item_sku}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{level.location_name}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-rose-700">
                        {level.qty_on_hand} {level.unit_of_measure}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">{level.reorder_point}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HmsCard>

        <HmsCard
          id="inventory-recent-movements"
          title="Recent stock movements"
          description={`The last ${movements.length} changes to stock`}
          icon={ArrowLeftRight}
          meaning="stock"
          flush
        >
          {movements.length === 0 ? (
            <HmsEmptyState
              bare
              art="truck"
              meaning="stock"
              title="No stock movements yet"
              description="Receipts, issues, transfers and waste will appear here as they happen."
            />
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-left text-sm text-slate-600">
                    <th className={TH}>Type</th>
                    <th className={TH}>Item</th>
                    <th className={`${TH} text-right`}>Qty</th>
                    <th className={TH}>Location</th>
                    <th className={TH}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3">
                        <HmsPill tone={MOVEMENT_TONES[m.movement_type] ?? "slate"}>{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</HmsPill>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{m.item_name}</div>
                        <div className="text-xs text-slate-600">{m.item_sku}</div>
                      </td>
                      <td
                        className={`whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums ${
                          m.qty > 0 ? "text-emerald-700" : m.qty < 0 ? "text-red-700" : "text-slate-700"
                        }`}
                      >
                        {signedQty(m)} {m.unit_of_measure}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {m.location_name}
                        {m.related_location_name ? (
                          <span className="text-xs text-slate-600">
                            {" "}
                            <span aria-hidden>→</span>
                            <span className="sr-only">to</span> {m.related_location_name}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatWhen(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HmsCard>
      </div>
    </HmsPage>
  );
}
