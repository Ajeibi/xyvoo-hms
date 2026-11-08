import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { AssetsClient } from "@/components/hms/maintenance/AssetsClient";
import { MaintenanceSubNav } from "@/components/hms/maintenance/maint-ui";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug, listRoomUnitsForTenant } from "@/lib/hms/data";
import { listAssets, listFixedAssetChoices } from "@/lib/hms/maintenance-assets";
import { getMaintenanceCapabilities } from "@/lib/hms/maintenance-rbac";
import { getMaintenanceSettings, listCategories } from "@/lib/hms/maintenance-settings";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MaintenanceAssetsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const caps = getMaintenanceCapabilities({ membershipRole: access.role, departmentRole: access.departmentRole });

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="maintenance">
        <HmsPage>
          <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Equipment" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }
  const service = createServerSupabaseClient();
  const settings = await getMaintenanceSettings(service, tenant.id);
  const [assets, rooms, fixed, categories] = await Promise.all([
    listAssets(service, tenant.id, { repeatThreshold: settings.repeatFaultThreshold }),
    listRoomUnitsForTenant(tenant.id),
    listFixedAssetChoices(service, tenant.id),
    listCategories(service, tenant.id, { activeOnly: true }),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="maintenance">
      <HmsPage wide>
        <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Equipment" description="Every piece of equipment you look after, with its repair history, warranty and running cost." />
        <MaintenanceSubNav slug={slug} />
        <AssetsClient
          slug={slug}
          assets={assets}
          rooms={rooms.map((r) => ({ id: r.id, code: r.room_code }))}
          fixedAssets={fixed}
          categories={categories.map((c) => c.name)}
          currency={normalizePricingSetup(tenant.pricing_setup).currency}
          canManage={caps.canManage}
          threshold={settings.repeatFaultThreshold}
        />
      </HmsPage>
    </HMSLayout>
  );
}
