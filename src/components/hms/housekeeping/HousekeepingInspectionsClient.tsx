"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { HousekeepingTaskRow } from "@/lib/hms/housekeeping-tasks";
import { PriorityBadge, taskTypeLabel } from "@/components/hms/housekeeping/HousekeepingBadges";

export function HousekeepingInspectionsClient({
  slug,
  tenantId,
  tasks,
}: {
  slug: string;
  tenantId: string;
  tasks: HousekeepingTaskRow[];
}) {
  const router = useRouter();
  const [noteByTask, setNoteByTask] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  useFrontDeskRealtime(tenantId, true);

  const inspect = async (taskId: string, result: "pass" | "fail") => {
    setBusyId(taskId);
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
      setBusyId(null);
    }
  };

  return (
    <div className="px-8 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Inspections</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Rooms awaiting sign-off. A pass marks the room ready; a fail reopens it for the attendant.
      </p>

      {tasks.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Nothing waiting on inspection.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">Room {t.roomCode}</p>
                  <p className="text-xs text-slate-500">
                    {taskTypeLabel(t.taskType)} · Cleaned by {t.assignedStaffName ?? "unassigned attendant"}
                  </p>
                </div>
                <PriorityBadge level={t.priorityLevel} />
              </div>
              <textarea
                className="mt-3 w-full rounded-lg border border-slate-200 p-2 text-sm"
                placeholder="Note (required on fail)"
                rows={2}
                value={noteByTask[t.id] ?? ""}
                onChange={(e) => setNoteByTask((prev) => ({ ...prev, [t.id]: e.target.value }))}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700"
                  disabled={busyId === t.id}
                  onClick={() => void inspect(t.id, "pass")}
                >
                  Pass — mark ready
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg border-red-200 text-red-700 hover:bg-red-50"
                  disabled={busyId === t.id}
                  onClick={() => void inspect(t.id, "fail")}
                >
                  Fail — send back
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
