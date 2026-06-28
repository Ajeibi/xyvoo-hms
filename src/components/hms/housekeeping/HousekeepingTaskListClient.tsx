"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { toastError, toastSuccess } from "@/lib/app-toast";

export type HkTaskRow = {
  id: string;
  roomCode: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  inspectedAt: string | null;
  assignedStaffId: string | null;
};

const NEXT_STATUS: Record<string, { label: string; status: string } | null> = {
  dirty: { label: "Start cleaning", status: "cleaning_in_progress" },
  cleaning_in_progress: { label: "Mark cleaned", status: "cleaned" },
  cleaned: { label: "Inspected", status: "inspected" },
  inspected: { label: "Ready for guest", status: "ready" },
  ready: null,
};

export function HousekeepingTaskListClient({
  slug,
  tasks,
}: {
  slug: string;
  tasks: HkTaskRow[];
}) {
  const router = useRouter();

  const advance = async (roomCode: string, status: string) => {
    const res = await fetch("/api/hotel/housekeeping/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, roomCode, status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not update task", data.error ?? "Try again.");
      return;
    }
    const label = Object.values(NEXT_STATUS).find((n) => n?.status === status)?.label ?? "Task updated";
    toastSuccess(`Room ${roomCode}: ${label}`);
    router.refresh();
  };

  if (tasks.length === 0) {
    return <p className="px-6 py-8 text-sm text-slate-500">No housekeeping tasks yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((t) => {
        const next = NEXT_STATUS[t.status];
        return (
          <li key={t.id} className="px-6 py-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">Room {t.roomCode}</p>
                <p className="mt-0.5 capitalize text-slate-600">{t.status.replace(/_/g, " ")}</p>
              </div>
              {next ? (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => void advance(t.roomCode, next.status)}
                >
                  {next.label}
                </Button>
              ) : (
                <span className="text-xs font-medium text-emerald-700">Ready</span>
              )}
            </div>
            <dl className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
              <div>Started: {t.startedAt ? formatBoardDateTime(t.startedAt) : "—"}</div>
              <div>Cleaned: {t.completedAt ? formatBoardDateTime(t.completedAt) : "—"}</div>
              <div>Inspected: {t.inspectedAt ? formatBoardDateTime(t.inspectedAt) : "—"}</div>
              <div>Assigned: {t.assignedStaffId ? "Yes" : "—"}</div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
