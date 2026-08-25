"use client";

import { useState } from "react";
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
      <p className="text-xs text-slate-500">{initialNote ? `Assigned: ${initialNote}` : "Unassigned"}</p>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Staff name"
          className="h-7 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="text-xs text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-700"
      onClick={() => {
        setValue(initialNote ?? "");
        setEditing(true);
      }}
    >
      {initialNote ? `Assigned: ${initialNote}` : "Unassigned — tap to assign"}
    </button>
  );
}
