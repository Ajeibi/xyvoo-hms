"use client";

import { useRouter } from "next/navigation";
import { BedDouble, UserX, Users } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsStatStrip, HmsStatTile } from "@/components/hms/hms-ui";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { HousekeepingTaskRow } from "@/lib/hms/housekeeping-tasks";
import { PriorityBadge, StatusBadge, taskTypeLabel } from "@/components/hms/housekeeping/HousekeepingBadges";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";

export function HousekeepingAssignmentsClient({
  slug,
  tenantId,
  tasks,
  attendants,
  canAccessAllDepartments,
}: {
  slug: string;
  tenantId: string;
  tasks: HousekeepingTaskRow[];
  attendants: { userId: string; name: string }[];
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  useFrontDeskRealtime(tenantId, true);

  const assign = async (taskId: string, staffUserId: string | null) => {
    const res = await fetch(`/api/hotel/housekeeping/tasks/${taskId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, staffUserId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not assign task", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Assignment updated.");
    router.refresh();
  };

  const unassigned = tasks.filter((t) => !t.assignedStaffId).length;

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Housekeeping"
        meaning="care"
        title="Assignments"
        description="Share today's open rooms fairly across your attendants."
      />

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {tasks.length > 0 ? (
        <HmsStatStrip label="Assignments at a glance" columns={3}>
          <HmsStatTile label="Open rooms" value={tasks.length} hint="Waiting to be cleaned" icon={BedDouble} meaning="care" />
          <HmsStatTile
            label="Not assigned yet"
            value={unassigned}
            hint="Pick someone for each"
            icon={UserX}
            meaning="attention"
            status={unassigned > 0 ? "warning" : undefined}
            statusText="Needs an attendant"
          />
          <HmsStatTile label="Attendants" value={attendants.length} hint="Available to assign" icon={Users} meaning="team" />
        </HmsStatStrip>
      ) : null}

      {tasks.length === 0 ? (
        <HmsEmptyState
          art="people"
          meaning="care"
          title="No open tasks to assign"
          description="When rooms need cleaning, you can choose who looks after each one here."
        />
      ) : (
        <HmsCard id="housekeeping-assignments" title="Open rooms" icon={Users} meaning="care" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Open housekeeping tasks and who they are assigned to</caption>
              <thead className="bg-violet-50/60 text-left text-sm text-slate-700">
                <tr>
                  <th scope="col" className="px-6 py-3 font-semibold">Room</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Type</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Priority</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Assigned to</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      Room {t.roomCode} <span className="font-normal text-slate-600">· Floor {t.floor}</span>
                    </td>
                    <td className="px-6 py-3 text-slate-700">{taskTypeLabel(t.taskType)}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-6 py-3">
                      {t.priorityLevel === "normal" ? (
                        <span className="text-slate-600">Normal</span>
                      ) : (
                        <PriorityBadge level={t.priorityLevel} />
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <label htmlFor={`hk-assign-${t.id}`} className="sr-only">
                        Assign room {t.roomCode} to
                      </label>
                      <select
                        id={`hk-assign-${t.id}`}
                        className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue"
                        value={t.assignedStaffId ?? ""}
                        onChange={(e) => void assign(t.id, e.target.value || null)}
                      >
                        <option value="">Unassigned</option>
                        {attendants.map((a) => (
                          <option key={a.userId} value={a.userId}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HmsCard>
      )}
    </HmsPage>
  );
}
