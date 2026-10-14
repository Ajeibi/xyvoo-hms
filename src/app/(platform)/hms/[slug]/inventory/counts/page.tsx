import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { InventoryStockCountsClient } from "@/components/hms/inventory/InventoryStockCountsClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
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
      <HmsPage>
        <HmsPageHeader
          eyebrow="Inventory"
          meaning="stock"
          title="Stock counts"
          description="Check physical counts against system balances. Posting a count adjusts stock by any difference."
        />
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryStockCountsClient slug={slug} initialCounts={counts} locations={locations} />
      </HmsPage>
    </HMSLayout>
  );
}
