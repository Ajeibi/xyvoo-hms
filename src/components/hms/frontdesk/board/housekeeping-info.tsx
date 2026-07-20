import type { HousekeepingTaskInfo } from "@/lib/hms/front-desk-board";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";

export function HousekeepingInfoBlock({
  unitStatus,
  task,
}: {
  unitStatus: string;
  task: HousekeepingTaskInfo | null;
}) {
  const show =
    task ||
    unitStatus === "dirty" ||
    unitStatus === "cleaning_in_progress" ||
    unitStatus === "maintenance";

  if (!show) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Housekeeping</p>
      <dl className="mt-2 space-y-1 text-slate-700">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Task status</dt>
          <dd className="font-medium capitalize">{task?.status.replace(/_/g, " ") ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Room unit</dt>
          <dd className="font-medium capitalize">{unitStatus.replace(/_/g, " ")}</dd>
        </div>
        {task?.priorityLevel && task.priorityLevel !== "normal" ? (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Priority</dt>
            <dd className="font-medium capitalize text-amber-700">{task.priorityLevel}</dd>
          </div>
        ) : null}
        {task?.dueBy ? (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Due by</dt>
            <dd className="font-medium">{formatBoardDateTime(task.dueBy)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Started</dt>
          <dd>{task?.startedAt ? formatBoardDateTime(task.startedAt) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Cleaned</dt>
          <dd>{task?.completedAt ? formatBoardDateTime(task.completedAt) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Inspected</dt>
          <dd>{task?.inspectedAt ? formatBoardDateTime(task.inspectedAt) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Assigned</dt>
          <dd>{task?.assignedStaffId ? "Staff assigned" : "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
