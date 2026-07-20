import HMSLayout from "@/components/hms/HMSLayout";
import { ProcurementDashboardClient } from "@/components/hms/procurement/ProcurementDashboardClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProcurementDashboardStats } from "@/lib/hms/procurement-dashboard";
import { getReorderSuggestions } from "@/lib/hms/inventory-stock";
import { listSourceableRequisitionLines, listPurchaseOrders } from "@/lib/hms/procurement-orders";

export default async function ProcurementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="procurement">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Procurement</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const supabase = createServerSupabaseClient();
  const [stats, reorderSuggestions, sourceableLines, pendingOrders] = await Promise.all([
    getProcurementDashboardStats(supabase, tenant.id),
    getReorderSuggestions(supabase, tenant.id),
    listSourceableRequisitionLines(supabase, tenant.id),
    listPurchaseOrders(supabase, tenant.id, { status: ["pending_approval"], limit: 5 }),
  ]);

  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  return (
    <HMSLayout slug={slug} requiredSection="procurement">
      <ProcurementDashboardClient
        slug={slug}
        currency={currency}
        stats={stats}
        reorderSuggestions={reorderSuggestions.slice(0, 6)}
        sourceableLines={sourceableLines.slice(0, 6)}
        pendingOrders={pendingOrders}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
