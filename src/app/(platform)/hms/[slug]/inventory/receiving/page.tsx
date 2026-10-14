import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { InventoryReceivingClient } from "@/components/hms/inventory/InventoryReceivingClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listReceipts } from "@/lib/hms/inventory-receipts";
import { listLocations, listItems, listSuppliers } from "@/lib/hms/inventory-items";

export default async function InventoryReceivingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let receipts: Awaited<ReturnType<typeof listReceipts>> = [];
  let locations: Awaited<ReturnType<typeof listLocations>> = [];
  let items: Awaited<ReturnType<typeof listItems>> = [];
  let suppliers: Awaited<ReturnType<typeof listSuppliers>> = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [receipts, locations, items, suppliers] = await Promise.all([
      listReceipts(supabase, tenant.id, { limit: 50 }),
      listLocations(supabase, tenant.id),
      listItems(supabase, tenant.id, { activeOnly: true, excludeFixedAssets: true }),
      listSuppliers(supabase, tenant.id),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-receiving">
      <HmsPage>
        <HmsPageHeader
          eyebrow="Inventory"
          meaning="stock"
          title="Goods receiving"
          description="Record stock arriving into a store. Each receipt goes into the stock ledger straight away."
        />
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryReceivingClient
          slug={slug}
          receipts={receipts}
          locations={locations}
          items={items}
          suppliers={suppliers}
          canCreateItem={access.canAccessAllDepartments}
        />
      </HmsPage>
    </HMSLayout>
  );
}
