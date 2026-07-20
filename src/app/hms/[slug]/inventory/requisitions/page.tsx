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
      listItems(supabase, tenant.id, { activeOnly: true }),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="inventory-requisitions">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Requisitions</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Department stock requests — approve, issue, or reject requests from a store.
        </p>
        <InventorySubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <InventoryRequisitionsClient
          slug={slug}
          requisitions={requisitions}
          locations={locations}
          items={items}
        />
      </div>
    </HMSLayout>
  );
}
