import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listOpenHousekeepingTasks } from "@/lib/hms/housekeeping-tasks";
import { getDepartmentLoginsBySlug } from "@/lib/hms/department-logins";
import { HousekeepingAssignmentsClient } from "@/components/hms/housekeeping/HousekeepingAssignmentsClient";

export default async function HousekeepingAssignmentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="housekeeping-assignments">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Assignments</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const [tasks, logins] = await Promise.all([
    listOpenHousekeepingTasks(service, tenant.id),
    getDepartmentLoginsBySlug(slug),
  ]);

  const attendants = logins
    .filter((l) => l.departmentRole === "Housekeeping")
    .map((l) => ({ userId: l.userId, name: l.fullName || l.email }));

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping-assignments">
      <HousekeepingAssignmentsClient
        slug={slug}
        tenantId={tenant.id}
        tasks={tasks}
        attendants={attendants}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
