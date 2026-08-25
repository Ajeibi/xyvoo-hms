"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HOUSEKEEPING_PRIORITY_LEVELS, HOUSEKEEPING_TASK_TYPES } from "@/lib/hms/housekeeping-tasks";
import { taskTypeLabel } from "@/components/hms/housekeeping/HousekeepingBadges";

const PRIORITY_LABEL: Record<string, string> = {
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
  vip: "VIP",
};

export type HousekeepingRoomOption = { id: string; roomCode: string; floor: number };

/** Lets Housekeeping raise its own task — a spill, a guest-requested extra clean — instead of
 * only ever reacting to a Front Desk checkout or a room already flagged dirty (HK-05). */
export function HousekeepingNewTaskDialog({
  slug,
  rooms,
  onCreated,
}: {
  slug: string;
  rooms: HousekeepingRoomOption[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [taskType, setTaskType] = useState<(typeof HOUSEKEEPING_TASK_TYPES)[number]>("deep_clean");
  const [priorityLevel, setPriorityLevel] = useState<(typeof HOUSEKEEPING_PRIORITY_LEVELS)[number]>("normal");
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRoomCode("");
    setTaskType("deep_clean");
    setPriorityLevel("normal");
    setNotes("");
    setAssignee("");
  };

  const submit = async () => {
    if (!roomCode.trim()) {
      toastError("Room is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/housekeeping/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          roomCode: roomCode.trim(),
          taskType,
          priorityLevel,
          notes: notes.trim() || undefined,
          assignedNote: assignee.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not raise task", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Room ${roomCode.trim()}: task raised`);
      setOpen(false);
      reset();
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="rounded-lg">
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        New task
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise a housekeeping task</DialogTitle>
            <DialogDescription>
              Log an ad-hoc request — a spill, a guest-requested extra clean — without waiting on Front Desk.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Room</label>
                <select
                  autoFocus
                  className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                >
                  <option value="">Select a room…</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.roomCode}>
                      Room {r.roomCode} · Floor {r.floor}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Assignee (optional)</label>
                <Input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="Staff name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Task type</label>
                <select
                  className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as typeof taskType)}
                >
                  {HOUSEKEEPING_TASK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {taskTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Priority</label>
                <select
                  className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                  value={priorityLevel}
                  onChange={(e) => setPriorityLevel(e.target.value as typeof priorityLevel)}
                >
                  {HOUSEKEEPING_PRIORITY_LEVELS.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
              <textarea
                className="min-h-[72px] w-full rounded-lg border border-input px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What needs attention?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" disabled={submitting || !roomCode.trim()} onClick={() => void submit()}>
              {submitting ? "Raising…" : "Raise task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
