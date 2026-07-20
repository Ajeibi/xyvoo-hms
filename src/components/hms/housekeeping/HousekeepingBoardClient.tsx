"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { useClientNow } from "@/hooks/useClientNow";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { HousekeepingTaskRow } from "@/lib/hms/housekeeping-tasks";
import { effectiveTaskDueBy, type TenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";
import { PriorityBadge, SlaCountdown, StatusBadge, taskTypeLabel } from "@/components/hms/housekeeping/HousekeepingBadges";

const NEXT_STATUS: Record<string, { label: string; status: string } | null> = {
  dirty: { label: "Start cleaning", status: "cleaning_in_progress" },
  cleaning_in_progress: { label: "Mark cleaned", status: "cleaned" },
  cleaned: null,
  inspected: null,
  ready: null,
};

export function HousekeepingBoardClient({
  slug,
  tenantId,
  tasks,
  settings,
  canManage,
}: {
  slug: string;
  tenantId: string;
  tasks: HousekeepingTaskRow[];
  settings: TenantHousekeepingSettings;
  canManage: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [now] = useClientNow();
  useFrontDeskRealtime(tenantId, true);

  const byFloor = useMemo(() => {
    const map = new Map<number, HousekeepingTaskRow[]>();
    for (const t of tasks) {
      const list = map.get(t.floor) ?? [];
      list.push(t);
      map.set(t.floor, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [tasks]);

  const advance = async (taskId: string, status: string, label: string) => {
    const res = await fetch(`/api/hotel/housekeeping/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not update task", data.error ?? "Try again.");
      return;
    }
    toastSuccess(label);
    router.refresh();
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/hotel/housekeeping/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not generate tasks", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Generated ${data.created} stayover task${data.created === 1 ? "" : "s"}.`);
      router.refresh();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Housekeeping</h1>
          <p className="mt-0.5 text-sm text-slate-500">Live room-cleaning board, grouped by floor.</p>
        </div>
        {canManage ? (
          <Button onClick={() => void generate()} disabled={generating} className="rounded-lg">
            {generating ? "Generating…" : "Generate today's tasks"}
          </Button>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No open housekeeping tasks right now.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {byFloor.map(([floor, floorTasks]) => (
            <div key={floor} className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Floor {floor}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {floorTasks.map((t) => {
                  const next = NEXT_STATUS[t.status];
                  return (
                    <div key={t.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">Room {t.roomCode}</p>
                          <p className="text-xs text-slate-500">{taskTypeLabel(t.taskType)}</p>
                        </div>
                        <PriorityBadge level={t.priorityLevel} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={t.status} />
                        {now != null ? (
                          <SlaCountdown dueBy={effectiveTaskDueBy(t.createdAt, t.taskType, t.dueBy, settings)} now={now} />
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {t.assignedStaffName ? `Assigned: ${t.assignedStaffName}` : "Unassigned"}
                      </p>
                      {next ? (
                        <Button
                          type="button"
                          size="sm"
                          className="mt-3 w-full rounded-lg"
                          onClick={() => void advance(t.id, next.status, `Room ${t.roomCode}: ${next.label}`)}
                        >
                          {next.label}
                        </Button>
                      ) : t.status === "cleaned" ? (
                        <p className="mt-3 text-xs font-medium text-amber-700">Awaiting inspection</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
