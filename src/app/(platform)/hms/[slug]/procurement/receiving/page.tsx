import HMSLayout from "@/components/hms/HMSLayout";
import { ProcurementSubNav } from "@/components/hms/procurement/ProcurementSubNav";
import { ProcurementReceivingClient } from "@/components/hms/procurement/ProcurementReceivingClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listPurchaseOrdersAwaitingReceipt, listProcurementReceipts } from "@/lib/hms/procurement-receiving";
import { getPurchaseOrderById } from "@/lib/hms/procurement-orders";
import { getChecklistItemsByItemId } from "@/lib/hms/procurement-quality";
import { listLocations } from "@/lib/hms/inventory-items";

export default async function ProcurementReceivingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ poId?: string }>;
}) {
  const { slug } = await params;
  const { poId } = await searchParams;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let awaitingOrders: Awaited<ReturnType<typeof listPurchaseOrdersAwaitingReceipt>> = [];
  let receipts: Awaited<ReturnType<typeof listProcurementReceipts>> = [];
  let locations: Awaited<ReturnType<typeof listLocations>> = [];
  let checklistByItemId: Record<string, string[]> = {};
  let preselectedOrder = null;

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [awaitingOrders, receipts, locations] = await Promise.all([
      listPurchaseOrdersAwaitingReceipt(supabase, tenant.id),
      listProcurementReceipts(supabase, tenant.id, { limit: 50 }),
      listLocations(supabase, tenant.id),
    ]);
    if (poId) preselectedOrder = await getPurchaseOrderById(supabase, tenant.id, poId);

    const itemIds = awaitingOrders.flatMap((o) => o.lines.map((l) => l.item_id).filter((id): id is string => Boolean(id)));
    checklistByItemId = await getChecklistItemsByItemId(supabase, tenant.id, itemIds);
  }

  return (
    <HMSLayout slug={slug} requiredSection="procurement-receiving">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Receiving</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Record goods received against a purchase order, run the quality checklist, and flag discrepancies before stock is accepted.
        </p>
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementReceivingClient
          slug={slug}
          awaitingOrders={awaitingOrders}
          receipts={receipts}
          locations={locations}
          checklistByItemId={checklistByItemId}
          preselectedOrder={preselectedOrder}
        />
      </div>
    </HMSLayout>
  );
}
