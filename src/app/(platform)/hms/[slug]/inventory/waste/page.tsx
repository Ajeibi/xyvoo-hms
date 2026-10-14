import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { InventoryWasteClient } from "@/components/hms/inventory/InventoryWasteClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRecentMovements } from "@/lib/hms/inventory-stock";
import { listItems, listLocations } from "@/lib/hms/inventory-items";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

export default async function InventoryWastePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const currency = normalizePricingSetup(tenant?.pricing_setup).currency;

  let movements: Awaited<ReturnType<typeof getRecentMovements>> = [];
  let locations: Awaited<ReturnType<typeof listLocations>> = [];
  let items: Awaited<ReturnType<typeof listItems>> = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [movements, locations, items] = await Promise.all([
      getRecentMovements(supabase, tenant.id, { movementType: "waste", limit: 100 }),
      listLocations(supabase, tenant.id),
      listItems(supabase, tenant.id, { activeOnly: true, excludeFixedAssets: true }),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-waste">
      <HmsPage wide>
        <HmsPageHeader
          eyebrow="Inventory"
          meaning="stock"
          title="Waste & spoilage"
          description="Log stock lost to breakage, spoilage or expiry. It comes off stock straight away, with the reason kept on record."
        />
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryWasteClient
          slug={slug}
          initialMovements={movements}
          locations={locations}
          items={items}
          currency={currency}
          canCreateItem={access.canAccessAllDepartments}
        />
      </HmsPage>
    </HMSLayout>
  );
}
