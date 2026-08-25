import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { InventoryStockCountsClient } from "@/components/hms/inventory/InventoryStockCountsClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listStockCounts } from "@/lib/hms/inventory-counts";
import { listLocations } from "@/lib/hms/inventory-items";

export default async function InventoryStockCountsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let counts: Awaited<ReturnType<typeof listStockCounts>> = [];
  let locations: Awaited<ReturnType<typeof listLocations>> = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [counts, locations] = await Promise.all([
      listStockCounts(supabase, tenant.id, { limit: 100 }),
      listLocations(supabase, tenant.id),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-counts">
      <div className="px-8 py-8">
        <div className="flex flex-wrap items-center gap-1.5">
          <h1 className="text-xl font-semibold text-slate-900">Stock counts</h1>
          <SettingsSectionInfo
            title="Stock counts"
            text="Reconcile a physical count against what the system expects. Starting a count snapshots current balances; posting it writes off any difference as a variance adjustment to stock."
          />
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          Reconcile physical counts against system balances and post variances.
        </p>
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryStockCountsClient slug={slug} initialCounts={counts} locations={locations} />
      </div>
    </HMSLayout>
  );
}
