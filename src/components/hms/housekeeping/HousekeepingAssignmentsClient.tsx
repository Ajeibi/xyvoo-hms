"use client";

import { useRouter } from "next/navigation";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { HousekeepingTaskRow } from "@/lib/hms/housekeeping-tasks";
import { PriorityBadge, StatusBadge, taskTypeLabel } from "@/components/hms/housekeeping/HousekeepingBadges";

export function HousekeepingAssignmentsClient({
  slug,
  tenantId,
  tasks,
  attendants,
}: {
  slug: string;
  tenantId: string;
  tasks: HousekeepingTaskRow[];
  attendants: { userId: string; name: string }[];
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

  return (
    <div className="px-8 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Assignments</h1>
      <p className="mt-0.5 text-sm text-slate-500">Assign or rebalance today&apos;s open tasks across attendants.</p>

      {tasks.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No open tasks to assign.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Room</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3">Assigned to</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-6 py-3 font-medium text-slate-900">
                    Room {t.roomCode} <span className="font-normal text-slate-400">· Floor {t.floor}</span>
                  </td>
                  <td className="px-6 py-3 text-slate-600">{taskTypeLabel(t.taskType)}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-6 py-3">
                    <PriorityBadge level={t.priorityLevel} />
                  </td>
                  <td className="px-6 py-3">
                    <select
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
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
      )}
    </div>
  );
}
