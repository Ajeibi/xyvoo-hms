import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
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
      listItems(supabase, tenant.id, { activeOnly: true }),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-transfers">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Transfers</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Move stock between store locations and confirm receipt on arrival.
        </p>
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryTransfersClient
          slug={slug}
          initialTransfers={transfers}
          locations={locations}
          items={items}
        />
      </div>
    </HMSLayout>
  );
}
