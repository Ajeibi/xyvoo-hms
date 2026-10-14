"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, ClipboardCheck, Sparkles } from "lucide-react";
import { HmsEmptyState, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { useClientNow } from "@/hooks/useClientNow";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { HousekeepingGuestRequest, HousekeepingTaskRow } from "@/lib/hms/housekeeping-tasks";
import { effectiveTaskDueBy, type TenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";
import type { RoomTypePar } from "@/lib/hms/housekeeping-inventory";
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

type SupplyDraft = { qty: number; missing: boolean };

export function HousekeepingMyTasksClient({
  slug,
  tenantId,
  tasks,
  settings,
  guestRequestsByTask,
  parsByTask,
  canAccessAllDepartments,
  canEditAssignedNote,
  canCreateManualTask,
  rooms,
}: {
  slug: string;
  tenantId: string;
  tasks: HousekeepingTaskRow[];
  settings: TenantHousekeepingSettings;
  guestRequestsByTask: Record<string, HousekeepingGuestRequest[]>;
  parsByTask: Record<string, RoomTypePar[]>;
  canAccessAllDepartments: boolean;
  canEditAssignedNote: boolean;
  canCreateManualTask: boolean;
  rooms: HousekeepingRoomOption[];
}) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, SupplyDraft>>({});
  const [now] = useClientNow();
  useFrontDeskRealtime(tenantId, true);

  const startBusy = (id: string) => setBusyIds((prev) => new Set(prev).add(id));
  const stopBusy = (id: string) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const advance = async (taskId: string, status: string, label: string) => {
    startBusy(taskId);
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
      stopBusy(taskId);
    }
  };

  const openCompletion = (taskId: string) => {
    const pars = parsByTask[taskId] ?? [];
    setDraft(Object.fromEntries(pars.map((p) => [p.itemId, { qty: p.parQty, missing: false }])));
    setCompletingTaskId(taskId);
  };

  const confirmCompletion = async (task: HousekeepingTaskRow) => {
    startBusy(task.id);
    try {
      const pars = parsByTask[task.id] ?? [];
      const lines = pars
        .filter((p) => !draft[p.itemId]?.missing)
        .map((p) => ({ itemId: p.itemId, qty: draft[p.itemId]?.qty ?? p.parQty }))
        .filter((l) => l.qty > 0);
      const missingLines = pars
        .filter((p) => draft[p.itemId]?.missing)
        .map((p) => ({ itemId: p.itemId, qty: p.parQty }));

      const res = await fetch(`/api/hotel/housekeeping/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, lines, missingLines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not complete task", data.error ?? "Try again.");
        return;
      }
      if (data.warnings?.length) {
        toastError("Completed with a supply issue", data.warnings.join(" "));
      } else {
        toastSuccess(`Room ${task.roomCode}: Mark cleaned`);
      }
      setCompletingTaskId(null);
      router.refresh();
    } finally {
      stopBusy(task.id);
    }
  };

  const completeGuestRequest = async (requestId: string) => {
    startBusy(requestId);
    try {
      const res = await fetch(`/api/hotel/housekeeping/guest-requests/${requestId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update request", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Guest request marked done.");
      router.refresh();
    } finally {
      stopBusy(requestId);
    }
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Housekeeping"
        meaning="care"
        title="Housekeeping tasks"
        description="Every open room for this property, highest priority first."
        actions={
          canCreateManualTask ? (
            <HousekeepingNewTaskDialog slug={slug} rooms={rooms} onCreated={() => router.refresh()} />
          ) : null
        }
      />

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsSectionIntro
        id="housekeeping-my-tasks"
        meaning="care"
        title="Working through your rooms"
        points={[
          "Tap the big button on a card when you start a room, and again when it's clean.",
          "Some rooms ask you to confirm the supplies you used before marking them cleaned.",
          "Guest requests for a room show on its card. Mark each one done when it's sorted.",
        ]}
      />

      {tasks.length === 0 ? (
        <HmsEmptyState
          icon={Sparkles}
          meaning="care"
          title="No open housekeeping tasks"
          description="You're all caught up. New rooms appear here as soon as they need cleaning."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((t) => {
            const next = NEXT_STATUS[t.status];
            const requests = guestRequestsByTask[t.id] ?? [];
            const pars = parsByTask[t.id] ?? [];
            const isCompleting = completingTaskId === t.id;
            return (
              <li key={t.id} className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-heading text-lg font-semibold text-slate-900">Room {t.roomCode}</p>
                    <p className="text-sm text-slate-700">{taskTypeLabel(t.taskType)}</p>
                  </div>
                  <PriorityBadge level={t.priorityLevel} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
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
                    canEdit={canEditAssignedNote}
                    onSaved={() => router.refresh()}
                  />
                </div>

                {requests.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                      <BellRing className="h-4 w-4 text-amber-600" aria-hidden />
                      Guest requests
                    </p>
                    <ul className="mt-2 space-y-2">
                      {requests.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 text-sm text-slate-800">
                          <span>
                            {r.requestType}
                            {r.details ? ` — ${r.details}` : ""}
                          </span>
                          <button
                            type="button"
                            className={`${hmsButton.secondary} min-h-9 shrink-0 px-3 py-1.5`}
                            disabled={busyIds.has(r.id)}
                            onClick={() => void completeGuestRequest(r.id)}
                          >
                            {busyIds.has(r.id) ? "Saving…" : "Mark done"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {isCompleting ? (
                  <fieldset className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                    <legend className="px-1 text-sm font-semibold text-slate-900">Confirm supplies used</legend>
                    <div className="mt-1 space-y-2">
                      {pars.map((p) => {
                        const d = draft[p.itemId] ?? { qty: p.parQty, missing: false };
                        const qtyId = `hk-supply-${t.id}-${p.itemId}`;
                        return (
                          <div key={p.itemId} className="flex items-center justify-between gap-2 text-sm">
                            <label htmlFor={qtyId} className="text-slate-800">{p.itemName}</label>
                            <div className="flex items-center gap-2">
                              <input
                                id={qtyId}
                                type="number"
                                min={0}
                                max={999}
                                disabled={d.missing}
                                value={d.qty}
                                onChange={(e) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    [p.itemId]: { ...d, qty: Math.max(0, Number(e.target.value) || 0) },
                                  }))
                                }
                                className="h-10 w-16 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue disabled:bg-slate-100"
                              />
                              <label className="flex min-h-10 items-center gap-1.5 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={d.missing}
                                  onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, [p.itemId]: { ...d, missing: e.target.checked } }))
                                  }
                                />
                                Out of stock
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className={`${hmsButton.primary} min-h-11 flex-1`}
                        disabled={busyIds.has(t.id)}
                        onClick={() => void confirmCompletion(t)}
                      >
                        {busyIds.has(t.id) ? "Saving…" : "Confirm & mark cleaned"}
                      </button>
                      <button
                        type="button"
                        className={`${hmsButton.secondary} min-h-11`}
                        disabled={busyIds.has(t.id)}
                        onClick={() => setCompletingTaskId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </fieldset>
                ) : next ? (
                  <button
                    type="button"
                    className={`${hmsButton.primary} mt-4 h-12 w-full rounded-xl text-base`}
                    disabled={busyIds.has(t.id)}
                    onClick={() =>
                      next.status === "cleaned" && pars.length > 0
                        ? openCompletion(t.id)
                        : void advance(t.id, next.status, `Room ${t.roomCode}: ${next.label}`)
                    }
                  >
                    {busyIds.has(t.id) ? "Saving…" : next.label}
                  </button>
                ) : t.status === "cleaned" ? (
                  <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-amber-800">
                    <ClipboardCheck className="h-4 w-4" aria-hidden />
                    Awaiting supervisor inspection
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </HmsPage>
  );
}
