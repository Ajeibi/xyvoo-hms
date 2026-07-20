"use client";

const TASK_TYPE_LABELS: Record<string, string> = {
  checkout_clean: "Checkout clean",
  stayover: "Stayover",
  deep_clean: "Deep clean",
  turndown: "Turndown",
  reinspection: "Reinspection",
};

export function taskTypeLabel(taskType: string): string {
  return TASK_TYPE_LABELS[taskType] ?? taskType.replace(/_/g, " ");
}

const STATUS_LABELS: Record<string, string> = {
  dirty: "Dirty",
  cleaning_in_progress: "Cleaning",
  cleaned: "Cleaned — awaiting inspection",
  inspected: "Inspected",
  ready: "Ready",
};

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    dirty: "bg-slate-100 text-slate-700",
    cleaning_in_progress: "bg-blue-50 text-blue-700",
    cleaned: "bg-amber-50 text-amber-700",
    inspected: "bg-indigo-50 text-indigo-700",
    ready: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone[status] ?? "bg-slate-100 text-slate-700"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function PriorityBadge({ level }: { level: string }) {
  if (level === "normal") return null;
  const tone: Record<string, string> = {
    high: "bg-amber-50 text-amber-700 border-amber-200",
    urgent: "bg-orange-50 text-orange-700 border-orange-200",
    vip: "bg-purple-50 text-purple-700 border-purple-200",
  };
  const label: Record<string, string> = { high: "High", urgent: "Urgent", vip: "VIP" };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone[level] ?? tone.high}`}>
      {label[level] ?? level}
    </span>
  );
}

/** `now` is passed in by the caller (from a ticking clock state) rather than read here,
 * so this stays a pure render — see `useNowTick`. */
export function SlaCountdown({ dueBy, now }: { dueBy: string | null; now: number }) {
  if (!dueBy) return null;
  const diffMs = new Date(dueBy).getTime() - now;
  const overdue = diffMs < 0;
  const minutes = Math.round(Math.abs(diffMs) / 60000);
  return (
    <span className={`text-xs font-medium ${overdue ? "text-red-600" : minutes <= 15 ? "text-amber-600" : "text-slate-500"}`}>
      {overdue ? `Overdue by ${minutes}m` : `Due in ${minutes}m`}
    </span>
  );
}
