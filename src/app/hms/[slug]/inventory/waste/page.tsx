import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { InventoryWasteClient } from "@/components/hms/inventory/InventoryWasteClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRecentMovements } from "@/lib/hms/inventory-stock";
import { listItems, listLocations } from "@/lib/hms/inventory-items";

export default async function InventoryWastePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let movements: Awaited<ReturnType<typeof getRecentMovements>> = [];
  let locations: Awaited<ReturnType<typeof listLocations>> = [];
  let items: Awaited<ReturnType<typeof listItems>> = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [movements, locations, items] = await Promise.all([
      getRecentMovements(supabase, tenant.id, { movementType: "waste", limit: 100 }),
      listLocations(supabase, tenant.id),
      listItems(supabase, tenant.id, { activeOnly: true }),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-waste">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Waste &amp; spoilage</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Log stock written off due to breakage, spoilage, or expiry.
        </p>
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryWasteClient
          slug={slug}
          initialMovements={movements}
          locations={locations}
          items={items}
        />
      </div>
    </HMSLayout>
  );
}
