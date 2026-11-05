import { ClipboardCheck, TrendingUp, Trash2, Wallet } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { normalizePricingSetup, formatPricingAmount } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRecentMovements, getStockLevels } from "@/lib/hms/inventory-stock";
import { listCategories, listItems } from "@/lib/hms/inventory-items";
import type { InventoryMovementWithDetails } from "@/lib/hms/inventory-types";

const TOP_MOVEMENT_TYPES = new Set<InventoryMovementWithDetails["movement_type"]>(["issue", "transfer_out", "waste"]);

const TH = "px-5 py-3 font-medium";
const HEAD_ROW = "border-b border-slate-100 text-left text-sm text-slate-600";
const ROW = "border-b border-slate-100 last:border-0";
const TOTAL_ROW = "border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900";

export default async function InventoryReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="inventory-reports">
        <HmsPage wide>
          <HmsPageHeader eyebrow="Inventory" meaning="stock" title="Inventory reports" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const supabase = createServerSupabaseClient();
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  const [stockLevels, items, categories, movements] = await Promise.all([
    getStockLevels(supabase, tenant.id),
    listItems(supabase, tenant.id),
    listCategories(supabase, tenant.id),
    getRecentMovements(supabase, tenant.id, { limit: 300 }),
  ]);

  // Stock valuation by category: join stock levels -> item -> category.
  const itemCategoryMap = new Map(items.map((it) => [it.id, it.category_id]));
  const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));

  const valuationByCategory = new Map<string, { name: string; value: number; qty: number }>();
  for (const level of stockLevels) {
    const categoryId = itemCategoryMap.get(level.item_id) ?? null;
    const key = categoryId ?? "uncategorized";
    const name = categoryId ? (categoryNameMap.get(categoryId) ?? "Unknown category") : "Uncategorized";
    const entry = valuationByCategory.get(key) ?? { name, value: 0, qty: 0 };
    entry.value += level.qty_on_hand * level.unit_cost;
    entry.qty += level.qty_on_hand;
    valuationByCategory.set(key, entry);
  }
  const valuationRows = [...valuationByCategory.values()].sort((a, b) => b.value - a.value);
  const totalValuation = valuationRows.reduce((sum, r) => sum + r.value, 0);

  // Top-moving items: aggregate absolute qty for issue/transfer_out/waste movements.
  const movementTotals = new Map<string, { name: string; sku: string; unit: string; qty: number }>();
  for (const m of movements) {
    if (!TOP_MOVEMENT_TYPES.has(m.movement_type)) continue;
    const entry = movementTotals.get(m.item_id) ?? { name: m.item_name, sku: m.item_sku, unit: m.unit_of_measure, qty: 0 };
    entry.qty += Math.abs(m.qty);
    movementTotals.set(m.item_id, entry);
  }
  const topMovers = [...movementTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

  const varianceRows = movements.filter((m) => m.movement_type === "count_variance");

  // Cost of waste: waste movements now carry a real unit_cost_at_movement (weighted-average cost at the time), grouped by reason.
  const wasteByReason = new Map<string, { reason: string; qty: number; cost: number }>();
  for (const m of movements) {
    if (m.movement_type !== "waste") continue;
    const reason = m.reason ?? "Unspecified";
    const entry = wasteByReason.get(reason) ?? { reason, qty: 0, cost: 0 };
    entry.qty += Math.abs(m.qty);
    entry.cost += Math.abs(m.qty) * m.unit_cost_at_movement;
    wasteByReason.set(reason, entry);
  }
  const wasteRows = [...wasteByReason.values()].sort((a, b) => b.cost - a.cost);
  const totalWasteCost = wasteRows.reduce((sum, r) => sum + r.cost, 0);

  return (
    <HMSLayout slug={slug} requiredSection="inventory-reports">
      <HmsPage wide>
        <HmsPageHeader
          eyebrow="Inventory"
          meaning="stock"
          title="Inventory reports"
          description="Stock valuation, top-moving items, waste and count-variance history, read straight from the stock ledger. Nothing here can be edited."
        />

        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />

        <HmsCard
          id="inventory-report-valuation"
          title="Stock valuation by category"
          description={`Total: ${formatPricingAmount(totalValuation, currency)}`}
          icon={Wallet}
          meaning="money"
          flush
          className="print:border-0 print:shadow-none"
        >
          {valuationRows.length === 0 ? (
            <HmsEmptyState bare art="box" meaning="stock" title="Nothing to value yet" description="No stock on hand to value yet." />
          ) : (
            <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {valuationRows.map((row) => (
                <li key={row.name} className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                      {totalValuation > 0 ? `${Math.round((row.value / totalValuation) * 100)}%` : "—"}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-slate-600">Qty on hand</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{row.qty.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-600">Value</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{formatPricingAmount(row.value, currency)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-slate-50 p-4 font-semibold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">{formatPricingAmount(totalValuation, currency)}</span>
              </li>
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={TH}>Category</th>
                    <th className={`${TH} text-right`}>Qty on hand</th>
                    <th className={`${TH} text-right`}>Value</th>
                    <th className={`${TH} text-right`}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {valuationRows.map((row) => (
                    <tr key={row.name} className={ROW}>
                      <td className="px-5 py-3 font-medium text-slate-900">{row.name}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">{row.qty.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-900">{formatPricingAmount(row.value, currency)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {totalValuation > 0 ? `${Math.round((row.value / totalValuation) * 100)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={TOTAL_ROW}>
                    <th scope="row" className="px-5 py-3 text-left">
                      Total
                    </th>
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3 text-right tabular-nums">{formatPricingAmount(totalValuation, currency)}</td>
                    <td className="px-5 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
            </>
          )}
        </HmsCard>

        <HmsCard
          id="inventory-report-top-movers"
          title="Top-moving items"
          description={`Ranked by total issued, transferred out or wasted quantity (last ${movements.length} movements considered).`}
          icon={TrendingUp}
          meaning="stock"
          flush
          className="print:border-0 print:shadow-none"
        >
          {topMovers.length === 0 ? (
            <HmsEmptyState bare art="truck" meaning="stock" title="No outbound movements yet" description="No outbound stock movements recorded yet." />
          ) : (
            <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {topMovers.map((row, idx) => (
                <li key={row.sku || row.name} className="flex items-center gap-3 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold tabular-nums text-slate-700">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{row.name}</p>
                    <p className="truncate text-xs text-slate-600">{row.sku}</p>
                  </div>
                  <p className="shrink-0 text-right font-semibold tabular-nums text-slate-900">
                    {row.qty.toLocaleString()} <span className="font-normal text-slate-600">{row.unit}</span>
                  </p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={TH}>Rank</th>
                    <th className={TH}>Item</th>
                    <th className={`${TH} text-right`}>Qty moved</th>
                  </tr>
                </thead>
                <tbody>
                  {topMovers.map((row, idx) => (
                    <tr key={row.sku || row.name} className={ROW}>
                      <td className="px-5 py-3 tabular-nums text-slate-600">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-600">{row.sku}</div>
                      </td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-900">
                        {row.qty.toLocaleString()} {row.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </HmsCard>

        <HmsCard
          id="inventory-report-waste"
          title="Cost of waste"
          description={<>By reason, using each movement&apos;s cost at the time it was recorded. Total: {formatPricingAmount(totalWasteCost, currency)}</>}
          icon={Trash2}
          meaning="attention"
          flush
          className="print:border-0 print:shadow-none"
        >
          {wasteRows.length === 0 ? (
            <HmsEmptyState bare art="basket" meaning="stock" title="No waste recorded" description="No waste recorded yet." />
          ) : (
            <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {wasteRows.map((row) => (
                <li key={row.reason} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{row.reason}</p>
                    <p className="text-xs text-slate-600">{row.qty.toLocaleString()} wasted</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-red-700">{formatPricingAmount(row.cost, currency)}</p>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-slate-50 p-4 font-semibold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">{formatPricingAmount(totalWasteCost, currency)}</span>
              </li>
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={TH}>Reason</th>
                    <th className={`${TH} text-right`}>Qty wasted</th>
                    <th className={`${TH} text-right`}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {wasteRows.map((row) => (
                    <tr key={row.reason} className={ROW}>
                      <td className="px-5 py-3 font-medium text-slate-900">{row.reason}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">{row.qty.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-900">{formatPricingAmount(row.cost, currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={TOTAL_ROW}>
                    <th scope="row" className="px-5 py-3 text-left">
                      Total
                    </th>
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3 text-right tabular-nums">{formatPricingAmount(totalWasteCost, currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </>
          )}
        </HmsCard>

        <HmsCard
          id="inventory-report-variance"
          title="Recent variance history"
          description="Adjustments posted from completed stock counts."
          icon={ClipboardCheck}
          meaning="stock"
          flush
          className="print:border-0 print:shadow-none"
        >
          {varianceRows.length === 0 ? (
            <HmsEmptyState bare art="page" meaning="stock" title="No count variances" description="No count variances recorded yet." />
          ) : (
            <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {varianceRows.map((row) => (
                <li key={row.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{row.item_name}</p>
                      <p className="text-xs text-slate-600">{row.item_sku}</p>
                    </div>
                    <p
                      className={`shrink-0 font-semibold tabular-nums ${
                        row.qty > 0 ? "text-emerald-700" : row.qty < 0 ? "text-red-700" : "text-slate-700"
                      }`}
                    >
                      {row.qty > 0 ? `+${row.qty}` : row.qty} {row.unit_of_measure}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-slate-600">Location</dt>
                      <dd className="mt-0.5 text-slate-900">{row.location_name}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-600">When</dt>
                      <dd className="mt-0.5 text-slate-900">
                        {new Date(row.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs font-medium text-slate-600">Reason</dt>
                      <dd className="mt-0.5 text-slate-900">{row.reason ?? "—"}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={TH}>Item</th>
                    <th className={TH}>Location</th>
                    <th className={`${TH} text-right`}>Variance</th>
                    <th className={TH}>Reason</th>
                    <th className={TH}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceRows.map((row) => (
                    <tr key={row.id} className={ROW}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{row.item_name}</div>
                        <div className="text-xs text-slate-600">{row.item_sku}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{row.location_name}</td>
                      <td
                        className={`whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums ${
                          row.qty > 0 ? "text-emerald-700" : row.qty < 0 ? "text-red-700" : "text-slate-700"
                        }`}
                      >
                        {row.qty > 0 ? `+${row.qty}` : row.qty} {row.unit_of_measure}
                      </td>
                      <td className="px-5 py-3 text-slate-700">{row.reason ?? "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                        {new Date(row.created_at).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </HmsCard>
      </HmsPage>
    </HMSLayout>
  );
}
