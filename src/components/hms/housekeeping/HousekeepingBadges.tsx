"use client";

import { AlarmClock, Clock, Lock, Moon, ShieldAlert } from "lucide-react";

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
  cleaned: "Cleaned, awaiting inspection",
  inspected: "Inspected",
  ready: "Ready",
};

/** Room-cleaning status as a coloured pill with words, so colour is never the only signal. */
export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    dirty: "bg-rose-50 text-rose-800 ring-rose-200",
    cleaning_in_progress: "bg-violet-50 text-violet-800 ring-violet-200",
    cleaned: "bg-amber-50 text-amber-800 ring-amber-200",
    inspected: "bg-indigo-50 text-indigo-800 ring-indigo-200",
    ready: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  };
  const dot: Record<string, string> = {
    dirty: "bg-rose-500",
    cleaning_in_progress: "bg-violet-500",
    cleaned: "bg-amber-500",
    inspected: "bg-indigo-500",
    ready: "bg-emerald-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tone[status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot[status] ?? "bg-slate-400"}`} />
      {STATUS_LABELS[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function PriorityBadge({ level }: { level: string }) {
  if (level === "normal") return null;
  const tone: Record<string, string> = {
    high: "bg-amber-50 text-amber-800 border-amber-200",
    urgent: "bg-rose-50 text-rose-800 border-rose-200",
    vip: "bg-violet-50 text-violet-800 border-violet-200",
  };
  const label: Record<string, string> = { high: "High priority", urgent: "Urgent", vip: "VIP" };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone[level] ?? tone.high}`}>
      {label[level] ?? level}
    </span>
  );
}

export type RoomFlagsInfo = { dnd: boolean; securityHold: boolean; staffRestricted: boolean };

/**
 * DND, security hold and staff-restricted badges for a room, shared by every housekeeping view.
 * Dark pills (matching the dark ring on the front desk Rooms board) with an icon and words.
 * The note under them says what the flag means for the cleaner.
 */
export function RoomFlagBadges({ flags, showNote = true }: { flags: RoomFlagsInfo; showNote?: boolean }) {
  if (!flags.dnd && !flags.securityHold && !flags.staffRestricted) return null;
  const pill = "inline-flex items-center gap-1 rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {flags.dnd ? (
          <span className={pill}>
            <Moon className="h-3 w-3" aria-hidden /> Do not disturb
          </span>
        ) : null}
        {flags.securityHold ? (
          <span className={pill}>
            <ShieldAlert className="h-3 w-3" aria-hidden /> Security hold
          </span>
        ) : null}
        {flags.staffRestricted ? (
          <span className={pill}>
            <Lock className="h-3 w-3" aria-hidden /> Staff restricted
          </span>
        ) : null}
      </div>
      {showNote ? (
        <p className="text-xs font-medium text-slate-800">
          {flags.securityHold || flags.staffRestricted
            ? "Do not enter without permission from the front desk or security."
            : "Routine cleaning needs the guest's permission. Check with the front desk before entering."}
        </p>
      ) : null}
    </div>
  );
}

/** `now` is passed in by the caller (from a ticking clock state) rather than read here,
 * so this stays a pure render (see `useNowTick`). */
export function SlaCountdown({ dueBy, now }: { dueBy: string | null; now: number }) {
  if (!dueBy) return null;
  const diffMs = new Date(dueBy).getTime() - now;
  const overdue = diffMs < 0;
  const minutes = Math.round(Math.abs(diffMs) / 60000);
  const Icon = overdue ? AlarmClock : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${overdue ? "text-rose-700" : minutes <= 15 ? "text-amber-800" : "text-slate-600"}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {overdue ? `Overdue by ${minutes}m` : `Due in ${minutes}m`}
    </span>
  );
}
