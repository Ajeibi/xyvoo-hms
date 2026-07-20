import HMSLayout from "@/components/hms/HMSLayout";
import { InventorySubNav } from "@/components/hms/inventory/InventorySubNav";
import { InventoryReceivingClient } from "@/components/hms/inventory/InventoryReceivingClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listReceipts } from "@/lib/hms/inventory-receipts";
import { listLocations, listItems } from "@/lib/hms/inventory-items";

export default async function InventoryReceivingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let receipts: Awaited<ReturnType<typeof listReceipts>> = [];
  let locations: Awaited<ReturnType<typeof listLocations>> = [];
  let items: Awaited<ReturnType<typeof listItems>> = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [receipts, locations, items] = await Promise.all([
      listReceipts(supabase, tenant.id, { limit: 50 }),
      listLocations(supabase, tenant.id),
      listItems(supabase, tenant.id, { activeOnly: true }),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-receiving">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Goods receiving</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Record stock arriving into a store — postings land in the ledger immediately.
        </p>
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryReceivingClient
          slug={slug}
          receipts={receipts}
          locations={locations}
          items={items}
        />
      </div>
    </HMSLayout>
  );
}
