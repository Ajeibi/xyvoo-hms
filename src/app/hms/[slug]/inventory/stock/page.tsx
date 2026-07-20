import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { InventoryStockClient } from "@/components/hms/inventory/InventoryStockClient";
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
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Stock levels</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Live quantities on hand across every store, with par and reorder controls.
        </p>
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryStockClient
          slug={slug}
          stockLevels={stockLevels}
          locations={locations}
          items={items}
        />
      </div>
    </HMSLayout>
  );
}
