"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, RotateCcw } from "lucide-react";
import { HmsEmptyState, HmsIconBadge, HmsPage, HmsPageHeader, hmsInput } from "@/components/hms/hms-ui";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { HousekeepingTaskRow } from "@/lib/hms/housekeeping-tasks";
import { PriorityBadge, taskTypeLabel } from "@/components/hms/housekeeping/HousekeepingBadges";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";

export function HousekeepingInspectionsClient({
  slug,
  tenantId,
  tasks,
  canAccessAllDepartments,
}: {
  slug: string;
  tenantId: string;
  tasks: HousekeepingTaskRow[];
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [noteByTask, setNoteByTask] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  useFrontDeskRealtime(tenantId, true);

  const inspect = async (taskId: string, result: "pass" | "fail") => {
    setBusyIds((prev) => new Set(prev).add(taskId));
    try {
      const res = await fetch(`/api/hotel/housekeeping/tasks/${taskId}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, result, note: noteByTask[taskId] || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not record inspection", data.error ?? "Try again.");
        return;
      }
      toastSuccess(result === "pass" ? "Room passed — marked ready." : "Room failed — reopened for rework.");
      router.refresh();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Housekeeping"
        meaning="care"
        title="Inspections"
        description="Rooms waiting for sign-off. A pass marks the room ready; a fail sends it back to the attendant."
      />

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {tasks.length === 0 ? (
        <HmsEmptyState
          art="star"
          meaning="care"
          title="Nothing waiting for inspection"
          description="Rooms appear here once an attendant marks them cleaned."
        />
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => {
            const noteId = `hk-inspect-note-${t.id}`;
            return (
              <li key={t.id} className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <HmsIconBadge icon={ClipboardCheck} meaning="care" />
                    <div>
                      <p className="font-heading text-base font-semibold text-slate-900">Room {t.roomCode}</p>
                      <p className="text-sm text-slate-700">
                        {taskTypeLabel(t.taskType)} · Assigned to {t.assignedNote ?? "no one yet"}
                      </p>
                    </div>
                  </div>
                  <PriorityBadge level={t.priorityLevel} />
                </div>
                <label htmlFor={noteId} className="mt-3 block text-sm font-medium text-slate-800">
                  Note <span className="font-normal text-slate-600">(needed if the room fails)</span>
                </label>
                <textarea
                  id={noteId}
                  className={`${hmsInput} mt-1`}
                  rows={2}
                  value={noteByTask[t.id] ?? ""}
                  onChange={(e) => setNoteByTask((prev) => ({ ...prev, [t.id]: e.target.value }))}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busyIds.has(t.id)}
                    onClick={() => void inspect(t.id, "pass")}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    {busyIds.has(t.id) ? "Saving…" : "Pass, mark ready"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busyIds.has(t.id)}
                    onClick={() => void inspect(t.id, "fail")}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {busyIds.has(t.id) ? "Saving…" : "Fail, send back"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </HmsPage>
  );
}
