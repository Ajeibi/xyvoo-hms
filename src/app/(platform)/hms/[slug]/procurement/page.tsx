import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
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
        <HmsPage>
          <HmsPageHeader eyebrow="Procurement" meaning="stock" title="Procurement" description="Hotel not found." />
        </HmsPage>
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
