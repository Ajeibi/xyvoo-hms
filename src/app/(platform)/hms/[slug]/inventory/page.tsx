import HMSLayout from "@/components/hms/HMSLayout";
import { InventoryDashboardClient } from "@/components/hms/inventory/InventoryDashboardClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInventoryDashboardStats, getLowStockLevels, getRecentMovements } from "@/lib/hms/inventory-stock";

export default async function InventoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="inventory">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const supabase = createServerSupabaseClient();
  const [stats, lowStock, movements] = await Promise.all([
    getInventoryDashboardStats(supabase, tenant.id),
    getLowStockLevels(supabase, tenant.id),
    getRecentMovements(supabase, tenant.id, { limit: 20 }),
  ]);

  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  return (
    <HMSLayout slug={slug} requiredSection="inventory">
      <InventoryDashboardClient
        slug={slug}
        tenantId={tenant.id}
        currency={currency}
        stats={stats}
        lowStock={lowStock}
        movements={movements}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
