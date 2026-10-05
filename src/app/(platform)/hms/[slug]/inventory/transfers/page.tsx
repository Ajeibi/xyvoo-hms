import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { InventoryTransfersClient } from "@/components/hms/inventory/InventoryTransfersClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listTransfers } from "@/lib/hms/inventory-transfers";
import { listItems, listLocations } from "@/lib/hms/inventory-items";

export default async function InventoryTransfersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let transfers: Awaited<ReturnType<typeof listTransfers>> = [];
  let locations: Awaited<ReturnType<typeof listLocations>> = [];
  let items: Awaited<ReturnType<typeof listItems>> = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [transfers, locations, items] = await Promise.all([
      listTransfers(supabase, tenant.id, { limit: 100 }),
      listLocations(supabase, tenant.id),
      listItems(supabase, tenant.id, { activeOnly: true, excludeFixedAssets: true }),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-transfers">
      <div className="px-8 py-8">
        <div className="flex flex-wrap items-center gap-1.5">
          <h1 className="text-xl font-semibold text-slate-900">Transfers</h1>
          <SettingsSectionInfo
            title="Transfers"
            text="Move stock between two stores. Stock leaves the source location immediately when a transfer is created, and only lands in the destination once receipt there is confirmed."
          />
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          Move stock between store locations and confirm receipt on arrival.
        </p>
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryTransfersClient
          slug={slug}
          initialTransfers={transfers}
          locations={locations}
          items={items}
          canCreateItem={access.canAccessAllDepartments}
        />
      </div>
    </HMSLayout>
  );
}
