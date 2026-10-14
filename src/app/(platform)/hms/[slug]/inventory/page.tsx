import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
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
        <HmsPage>
          <HmsPageHeader eyebrow="Inventory" meaning="stock" title="Inventory" description="Hotel not found." />
        </HmsPage>
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
