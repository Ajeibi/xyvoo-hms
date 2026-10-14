import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { InventoryStockClient } from "@/components/hms/inventory/InventoryStockClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listLocations, listItems } from "@/lib/hms/inventory-items";
import { getStockLevels } from "@/lib/hms/inventory-stock";

export default async function InventoryStockPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let stockLevels: Awaited<ReturnType<typeof getStockLevels>> = [];
  let locations: Awaited<ReturnType<typeof listLocations>> = [];
  let items: Awaited<ReturnType<typeof listItems>> = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [stockLevels, locations, items] = await Promise.all([
      getStockLevels(supabase, tenant.id),
      listLocations(supabase, tenant.id),
      listItems(supabase, tenant.id, { activeOnly: true }),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-stock">
      <HmsPage wide>
        <HmsPageHeader
          eyebrow="Inventory"
          meaning="stock"
          title="Stock levels"
          description="Live quantities on hand at every store, with par and reorder controls."
        />
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryStockClient
          slug={slug}
          stockLevels={stockLevels}
          locations={locations}
          items={items}
          canCreateItem={access.canAccessAllDepartments}
        />
      </HmsPage>
    </HMSLayout>
  );
}
