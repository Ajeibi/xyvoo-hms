import HMSLayout from "@/components/hms/HMSLayout";
import { ProcurementSubNav } from "@/components/hms/procurement/ProcurementSubNav";
import { ProcurementOrdersClient } from "@/components/hms/procurement/ProcurementOrdersClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { listPurchaseOrders } from "@/lib/hms/procurement-orders";

export default async function ProcurementOrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let orders: Awaited<ReturnType<typeof listPurchaseOrders>> = [];
  let currency = "NGN";
  if (tenant) {
    const supabase = createServerSupabaseClient();
    orders = await listPurchaseOrders(supabase, tenant.id, { limit: 200 });
    currency = normalizePricingSetup(tenant.pricing_setup).currency;
  }

  return (
    <HMSLayout slug={slug} requiredSection="procurement-orders">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Purchase orders</h1>
        <p className="mt-0.5 text-sm text-slate-500">Every PO from draft through approval, ordering, and receipt.</p>
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementOrdersClient slug={slug} orders={orders} currency={currency} />
      </div>
    </HMSLayout>
  );
}
