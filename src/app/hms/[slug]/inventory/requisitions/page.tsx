import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { InventoryRequisitionsClient } from "@/components/hms/inventory/InventoryRequisitionsClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listRequisitions } from "@/lib/hms/inventory-requisitions";
import { listLocations, listItems } from "@/lib/hms/inventory-items";

export default async function InventoryRequisitionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let requisitions: Awaited<ReturnType<typeof listRequisitions>> = [];
  let locations: Awaited<ReturnType<typeof listLocations>> = [];
  let items: Awaited<ReturnType<typeof listItems>> = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [requisitions, locations, items] = await Promise.all([
      listRequisitions(supabase, tenant.id, { limit: 100 }),
      listLocations(supabase, tenant.id),
      listItems(supabase, tenant.id, { activeOnly: true, excludeFixedAssets: true }),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-requisitions">
      <div className="px-8 py-8">
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryRequisitionsClient
          slug={slug}
          requisitions={requisitions}
          locations={locations}
          items={items}
          canCreateItem={access.canAccessAllDepartments}
        />
      </div>
    </HMSLayout>
  );
}
