import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { MaintenanceSettingsClient } from "@/components/hms/maintenance/MaintenanceSettingsClient";
import { MaintenanceSubNav } from "@/components/hms/maintenance/maint-ui";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getMaintenanceCapabilities } from "@/lib/hms/maintenance-rbac";
import { getMaintenanceSettings, listCategories, listTechnicians } from "@/lib/hms/maintenance-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MaintenanceSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const caps = getMaintenanceCapabilities({ membershipRole: access.role, departmentRole: access.departmentRole });

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="maintenance-settings">
        <HmsPage>
          <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Maintenance settings" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }
  const service = createServerSupabaseClient();
  const [settings, categories, technicians] = await Promise.all([
    getMaintenanceSettings(service, tenant.id),
    listCategories(service, tenant.id),
    listTechnicians(service, tenant.id),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="maintenance-settings">
      <HmsPage>
        <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Maintenance settings" description="Target times, the people who do the work, and the types of problem staff can pick." />
        <MaintenanceSubNav slug={slug} />
        <MaintenanceSettingsClient slug={slug} settings={settings} categories={categories} technicians={technicians} canConfigure={caps.canConfigure} />
      </HmsPage>
    </HMSLayout>
  );
}
