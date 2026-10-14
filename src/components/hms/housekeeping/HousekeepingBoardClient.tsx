"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, BedDouble, ClipboardCheck, Layers, Loader2, Sparkles, SprayCan } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsStatStrip, HmsStatTile, hmsButton } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { useClientNow } from "@/hooks/useClientNow";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { HousekeepingTaskRow } from "@/lib/hms/housekeeping-tasks";
import { effectiveTaskDueBy, type TenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";
import { PriorityBadge, SlaCountdown, StatusBadge, taskTypeLabel } from "@/components/hms/housekeeping/HousekeepingBadges";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";
import { HousekeepingAssigneeField } from "@/components/hms/housekeeping/HousekeepingAssigneeField";
import { HousekeepingNewTaskDialog, type HousekeepingRoomOption } from "@/components/hms/housekeeping/HousekeepingNewTaskDialog";

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
  canCreateManualTask,
  canAccessAllDepartments,
  rooms,
}: {
  slug: string;
  tenantId: string;
  tasks: HousekeepingTaskRow[];
  settings: TenantHousekeepingSettings;
  canManage: boolean;
  canCreateManualTask: boolean;
  canAccessAllDepartments: boolean;
  rooms: HousekeepingRoomOption[];
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
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
    setBusyIds((prev) => new Set(prev).add(taskId));
    try {
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
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
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

  const counts = useMemo(() => {
    let dirty = 0;
    let cleaning = 0;
    let awaitingInspection = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (t.status === "dirty") dirty += 1;
      else if (t.status === "cleaning_in_progress") cleaning += 1;
      else if (t.status === "cleaned") awaitingInspection += 1;
      if (now != null) {
        const due = effectiveTaskDueBy(t.createdAt, t.taskType, t.dueBy, settings);
        if (due && new Date(due).getTime() < now) overdue += 1;
      }
    }
    return { dirty, cleaning, awaitingInspection, overdue };
  }, [tasks, now, settings]);

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Housekeeping"
        meaning="care"
        title="Housekeeping board"
        description="Every room that needs cleaning today, grouped by floor."
        actions={
          <>
            {canCreateManualTask ? (
              <HousekeepingNewTaskDialog slug={slug} rooms={rooms} onCreated={() => router.refresh()} />
            ) : null}
            {canManage ? (
              <button type="button" onClick={() => void generate()} disabled={generating} className={hmsButton.primary}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                {generating ? "Generating…" : "Generate today's tasks"}
              </button>
            ) : null}
          </>
        }
      />

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsSectionIntro
        id="housekeeping-board"
        meaning="care"
        title="How the board works"
        points={[
          "Each card is a room. Tap the button on the card to start cleaning, then to mark it cleaned.",
          "Cleaned rooms wait for an inspection before they're ready for guests.",
          canManage
            ? "Use Generate today's tasks each morning to add stayover cleans for occupied rooms."
            : "The time on each card shows how long is left before the clean is due.",
        ]}
      />

      <HmsStatStrip label="Rooms at a glance">
        <HmsStatTile label="Dirty" value={counts.dirty} hint="Not started yet" icon={BedDouble} meaning="care" />
        <HmsStatTile label="Being cleaned" value={counts.cleaning} hint="Someone is in the room" icon={SprayCan} meaning="care" />
        <HmsStatTile
          label="Awaiting inspection"
          value={counts.awaitingInspection}
          hint="Cleaned, needs a check"
          icon={ClipboardCheck}
          meaning="team"
        />
        <HmsStatTile
          label="Overdue"
          value={now == null ? "—" : counts.overdue}
          hint="Past the time they were due"
          icon={AlarmClock}
          meaning="attention"
          status={counts.overdue > 0 ? "critical" : undefined}
          statusText="Past due, needs someone now"
        />
      </HmsStatStrip>

      {tasks.length === 0 ? (
        <HmsEmptyState
          icon={Sparkles}
          meaning="care"
          title="No open housekeeping tasks"
          description="Nothing needs cleaning at the moment. New tasks appear here as soon as a room needs attention."
        />
      ) : (
        <div className="space-y-6">
          {byFloor.map(([floor, floorTasks]) => (
            <HmsCard
              key={floor}
              id={`housekeeping-floor-${floor}`}
              title={`Floor ${floor}`}
              description={`${floorTasks.length} room${floorTasks.length === 1 ? "" : "s"} to look after`}
              icon={Layers}
              meaning="care"
            >
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {floorTasks.map((t) => {
                  const next = NEXT_STATUS[t.status];
                  return (
                    <li key={t.id} className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-heading text-base font-semibold text-slate-900">Room {t.roomCode}</p>
                          <p className="text-sm text-slate-700">{taskTypeLabel(t.taskType)}</p>
                        </div>
                        <PriorityBadge level={t.priorityLevel} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={t.status} />
                        {now != null ? (
                          <SlaCountdown dueBy={effectiveTaskDueBy(t.createdAt, t.taskType, t.dueBy, settings)} now={now} />
                        ) : null}
                      </div>
                      <div className="mt-2">
                        <HousekeepingAssigneeField
                          slug={slug}
                          taskId={t.id}
                          initialNote={t.assignedNote}
                          canEdit={canManage}
                          onSaved={() => router.refresh()}
                        />
                      </div>
                      {next ? (
                        <button
                          type="button"
                          className={`${hmsButton.primary} mt-3 min-h-11 w-full`}
                          disabled={busyIds.has(t.id)}
                          onClick={() => void advance(t.id, next.status, `Room ${t.roomCode}: ${next.label}`)}
                        >
                          {busyIds.has(t.id) ? "Saving…" : next.label}
                        </button>
                      ) : t.status === "cleaned" ? (
                        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-amber-800">
                          <ClipboardCheck className="h-4 w-4" aria-hidden />
                          Awaiting inspection
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </HmsCard>
          ))}
        </div>
      )}
    </HmsPage>
  );
}
