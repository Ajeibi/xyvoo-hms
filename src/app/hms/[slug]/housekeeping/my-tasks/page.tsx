import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug, listRoomUnitsForTenant } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOpenGuestRequestsForReservation, listOpenHousekeepingTasks } from "@/lib/hms/housekeeping-tasks";
import { getTenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";
import { listRoomTypePars } from "@/lib/hms/housekeeping-inventory";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { HousekeepingMyTasksClient } from "@/components/hms/housekeeping/HousekeepingMyTasksClient";

export default async function HousekeepingMyTasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant || !access.userId) {
    return (
      <HMSLayout slug={slug} requiredSection="housekeeping-my-tasks">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Housekeeping tasks</h1>
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
  const [tasks, settings, allPars, rooms] = await Promise.all([
    listOpenHousekeepingTasks(service, tenant.id),
    getTenantHousekeepingSettings(service, tenant.id),
    listRoomTypePars(service, tenant.id),
    listRoomUnitsForTenant(tenant.id),
  ]);

  const guestRequestsByTask = new Map<string, Awaited<ReturnType<typeof getOpenGuestRequestsForReservation>>>();
  for (const task of tasks) {
    if (!task.reservationId) continue;
    guestRequestsByTask.set(task.id, await getOpenGuestRequestsForReservation(service, tenant.id, task.reservationId));
  }

  const parsByRoomType = new Map<string, typeof allPars>();
  for (const par of allPars) {
    const list = parsByRoomType.get(par.roomTypeCode) ?? [];
    list.push(par);
    parsByRoomType.set(par.roomTypeCode, list);
  }
  const parsByTask = Object.fromEntries(
    tasks.map((t) => [t.id, t.roomTypeCode ? (parsByRoomType.get(t.roomTypeCode) ?? []) : []]),
  );

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping-my-tasks">
      <HousekeepingMyTasksClient
        slug={slug}
        tenantId={tenant.id}
        tasks={tasks}
        settings={settings}
        guestRequestsByTask={Object.fromEntries(guestRequestsByTask)}
        parsByTask={parsByTask}
        canAccessAllDepartments={access.canAccessAllDepartments}
        canEditAssignedNote={caps.canEditAssignedNote}
        canCreateManualTask={caps.canCreateManualTask}
        rooms={rooms.map((r) => ({ id: r.id, roomCode: r.room_code, floor: r.floor }))}
      />
    </HMSLayout>
  );
}
