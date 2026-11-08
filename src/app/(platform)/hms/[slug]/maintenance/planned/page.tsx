import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { MaintenanceSubNav } from "@/components/hms/maintenance/maint-ui";
import { PlannedClient } from "@/components/hms/maintenance/PlannedClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { loadChoices } from "@/lib/hms/maintenance-page";
import { getMaintenanceCapabilities } from "@/lib/hms/maintenance-rbac";
import { listSchedules } from "@/lib/hms/maintenance-schedules";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MaintenancePlannedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const caps = getMaintenanceCapabilities({ membershipRole: access.role, departmentRole: access.departmentRole });

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="maintenance">
        <HmsPage>
          <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Planned maintenance" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }
  const service = createServerSupabaseClient();
  const [schedules, choices] = await Promise.all([listSchedules(service, tenant.id), loadChoices(service, tenant.id)]);

  return (
    <HMSLayout slug={slug} requiredSection="maintenance">
      <HmsPage wide>
        <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Planned maintenance" description="Jobs that repeat on a schedule. A work order is raised for each one before it falls due, so nothing is forgotten." />
        <MaintenanceSubNav slug={slug} />
        <PlannedClient
          slug={slug}
          schedules={schedules}
          rooms={choices.rooms.map((r) => ({ id: r.id, label: r.code }))}
          assets={choices.assets.map((a) => ({ id: a.id, label: a.label }))}
          technicians={choices.technicians}
          categories={choices.categories}
          canManage={caps.canManage}
          today={new Date().toISOString().slice(0, 10)}
        />
      </HmsPage>
    </HMSLayout>
  );
}
