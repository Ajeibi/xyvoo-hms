"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";

/** Free-text "who's on this" label for a housekeeping task — set manually, not picked from a
 * real login account, since staff are divided up outside the system rather than via
 * per-attendant logins. Shared between the admin Board and the department-wide task list. */
export function HousekeepingAssigneeField({
  slug,
  taskId,
  initialNote,
  canEdit,
  onSaved,
}: {
  slug: string;
  taskId: string;
  initialNote: string | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/hotel/housekeeping/tasks/${taskId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, note: value.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Saved");
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-slate-700">
        <UserRound className="h-4 w-4 text-violet-600" aria-hidden />
        {initialNote ? `Assigned: ${initialNote}` : "Unassigned"}
      </p>
    );
  }

  if (editing) {
    const inputId = `hk-assignee-${taskId}`;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          Who is looking after this room
        </label>
        <Input
          id={inputId}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Staff name"
          className="h-9 min-w-0 flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button type="button" size="sm" className="h-9 px-3 text-sm" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-9 px-3 text-sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg text-sm text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      onClick={() => {
        setValue(initialNote ?? "");
        setEditing(true);
      }}
    >
      <UserRound className="h-4 w-4 text-violet-600" aria-hidden />
      {initialNote ? `Assigned: ${initialNote}` : "Unassigned, tap to assign"}
    </button>
  );
}
