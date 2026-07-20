import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { normalizePricingSetup, formatPricingAmount } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRecentMovements, getStockLevels } from "@/lib/hms/inventory-stock";
import { listCategories, listItems } from "@/lib/hms/inventory-items";
import type { InventoryMovementWithDetails } from "@/lib/hms/inventory-types";

const TOP_MOVEMENT_TYPES = new Set<InventoryMovementWithDetails["movement_type"]>(["issue", "transfer_out", "waste"]);

export default async function InventoryReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="inventory-reports">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Inventory reports</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
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

  return (
    <HMSLayout slug={slug} requiredSection="inventory-reports">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Inventory reports</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Stock valuation, top-moving items, and count-variance history.
        </p>

        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Stock valuation by category</h2>
              <span className="text-xs text-slate-400">Total: {formatPricingAmount(totalValuation, currency)}</span>
            </div>
            {valuationRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No stock on hand to value yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-2.5">Category</th>
                      <th className="px-5 py-2.5 text-right">Qty on hand</th>
                      <th className="px-5 py-2.5 text-right">Value</th>
                      <th className="px-5 py-2.5 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valuationRows.map((row) => (
                      <tr key={row.name} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-2.5 font-medium text-slate-800">{row.name}</td>
                        <td className="px-5 py-2.5 text-right text-slate-600">{row.qty.toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right text-slate-800">{formatPricingAmount(row.value, currency)}</td>
                        <td className="px-5 py-2.5 text-right text-slate-500">
                          {totalValuation > 0 ? `${Math.round((row.value / totalValuation) * 100)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Top-moving items</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Ranked by total issued, transferred out, or wasted quantity (last {movements.length} movements considered).
              </p>
            </div>
            {topMovers.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No outbound stock movements recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-2.5">#</th>
                      <th className="px-5 py-2.5">Item</th>
                      <th className="px-5 py-2.5 text-right">Qty moved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topMovers.map((row, idx) => (
                      <tr key={row.sku || row.name} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-2.5 text-slate-400">{idx + 1}</td>
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-slate-800">{row.name}</div>
                          <div className="text-xs text-slate-400">{row.sku}</div>
                        </td>
                        <td className="px-5 py-2.5 text-right font-medium text-slate-800">
                          {row.qty.toLocaleString()} {row.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Recent variance history</h2>
              <p className="mt-0.5 text-xs text-slate-400">Adjustments posted from completed stock counts.</p>
            </div>
            {varianceRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No count variances recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-2.5">Item</th>
                      <th className="px-5 py-2.5">Location</th>
                      <th className="px-5 py-2.5 text-right">Variance</th>
                      <th className="px-5 py-2.5">Reason</th>
                      <th className="px-5 py-2.5">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {varianceRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-slate-800">{row.item_name}</div>
                          <div className="text-xs text-slate-400">{row.item_sku}</div>
                        </td>
                        <td className="px-5 py-2.5 text-slate-600">{row.location_name}</td>
                        <td
                          className={`px-5 py-2.5 text-right font-medium ${
                            row.qty > 0 ? "text-emerald-600" : row.qty < 0 ? "text-red-500" : "text-slate-500"
                          }`}
                        >
                          {row.qty > 0 ? `+${row.qty}` : row.qty} {row.unit_of_measure}
                        </td>
                        <td className="px-5 py-2.5 text-slate-500">{row.reason ?? "—"}</td>
                        <td className="px-5 py-2.5 text-slate-500">
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
            )}
          </section>
        </div>
      </div>
    </HMSLayout>
  );
}
