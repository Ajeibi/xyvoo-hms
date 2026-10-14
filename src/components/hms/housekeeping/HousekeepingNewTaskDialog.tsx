"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
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
      <button type="button" onClick={() => setOpen(true)} className={hmsButton.secondary}>
        <Plus className="h-4 w-4 text-violet-600" aria-hidden />
        New task
      </button>

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
              Log a one-off job, such as a spill or an extra clean a guest asked for, without waiting for the front desk.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <HmsField id="hk-new-room" label="Room">
                <select
                  id="hk-new-room"
                  autoFocus
                  className={hmsInput}
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
              </HmsField>
              <HmsField id="hk-new-assignee" label="Assignee" optional>
                <input
                  id="hk-new-assignee"
                  className={hmsInput}
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="Staff name"
                />
              </HmsField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <HmsField id="hk-new-type" label="Task type">
                <select
                  id="hk-new-type"
                  className={hmsInput}
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as typeof taskType)}
                >
                  {HOUSEKEEPING_TASK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {taskTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </HmsField>
              <HmsField id="hk-new-priority" label="Priority">
                <select
                  id="hk-new-priority"
                  className={hmsInput}
                  value={priorityLevel}
                  onChange={(e) => setPriorityLevel(e.target.value as typeof priorityLevel)}
                >
                  {HOUSEKEEPING_PRIORITY_LEVELS.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </HmsField>
            </div>
            <HmsField id="hk-new-notes" label="Notes" optional>
              <textarea
                id="hk-new-notes"
                className={`${hmsInput} min-h-[72px]`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What needs attention?"
              />
            </HmsField>
          </div>

          <DialogFooter>
            <button type="button" className={hmsButton.secondary} onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className={hmsButton.primary} disabled={submitting || !roomCode.trim()} onClick={() => void submit()}>
              {submitting ? "Raising…" : "Raise task"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
