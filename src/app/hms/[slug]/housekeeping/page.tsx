import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { listOpenHousekeepingTasks } from "@/lib/hms/housekeeping-tasks";
import { getTenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";
import { HousekeepingBoardClient } from "@/components/hms/housekeeping/HousekeepingBoardClient";

export default async function HousekeepingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="housekeeping">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Housekeeping</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const caps = getHousekeepingCapabilities({
    membershipRole: access.role ?? "staff",
    departmentRole: access.departmentRole,
  });

  const service = createServerSupabaseClient();
  const [tasks, settings] = await Promise.all([
    listOpenHousekeepingTasks(service, tenant.id),
    getTenantHousekeepingSettings(service, tenant.id),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping">
      <HousekeepingBoardClient
        slug={slug}
        tenantId={tenant.id}
        tasks={tasks}
        settings={settings}
        canManage={caps.canManageAssignments}
      />
    </HMSLayout>
  );
}
