import { Suspense } from "react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { MaintenanceSubNav } from "@/components/hms/maintenance/maint-ui";
import { WorkOrdersClient } from "@/components/hms/maintenance/WorkOrdersClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { listWorkOrders } from "@/lib/hms/maintenance-orders";
import { loadChoices } from "@/lib/hms/maintenance-page";
import { getMaintenanceCapabilities } from "@/lib/hms/maintenance-rbac";
import { WO_PRIORITIES, WO_STATUSES } from "@/lib/hms/maintenance-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SP = { status?: string; priority?: string; technicianId?: string; q?: string; new?: string; roomUnitId?: string; title?: string; assetId?: string };

export default async function MaintenanceOrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const caps = getMaintenanceCapabilities({ membershipRole: access.role, departmentRole: access.departmentRole });

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="maintenance">
        <HmsPage>
          <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Work orders" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const status = sp.status && (sp.status === "open" || sp.status === "all" || (WO_STATUSES as readonly string[]).includes(sp.status)) ? sp.status : "open";
  const priority = sp.priority && (WO_PRIORITIES as readonly string[]).includes(sp.priority) ? sp.priority : "";
  const [orders, choices] = await Promise.all([
    listWorkOrders(service, tenant.id, {
      status: status as never,
      priority: priority ? (priority as never) : undefined,
      technicianId: sp.technicianId || undefined,
      search: sp.q || undefined,
    }),
    loadChoices(service, tenant.id),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="maintenance">
      <HmsPage wide>
        <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Work orders" description="Every fault, who has it, and when it is due. Overdue jobs come first." />
        <MaintenanceSubNav slug={slug} />
        <Suspense>
          <WorkOrdersClient
            slug={slug}
            orders={orders}
            rooms={choices.rooms}
            assets={choices.assets}
            categories={choices.categories}
            technicians={choices.technicians.filter((t) => t.active)}
            canManage={caps.canManage}
            filter={{ status, priority, technicianId: sp.technicianId ?? "", q: sp.q ?? "" }}
            openNew={sp.new === "1"}
            defaults={sp.new === "1" ? { roomUnitId: sp.roomUnitId, title: sp.title, assetId: sp.assetId } : undefined}
          />
        </Suspense>
      </HmsPage>
    </HMSLayout>
  );
}
