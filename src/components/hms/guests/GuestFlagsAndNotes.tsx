"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { GuestNoteRow } from "@/lib/hms/guest-management";
import { cn } from "@/lib/utils";

export function GuestFlagsAndNotes({
  slug,
  guestId,
  isVip,
  isDoNotWalk,
  notes,
  canEdit,
}: {
  slug: string;
  guestId: string;
  isVip: boolean;
  isDoNotWalk: boolean;
  notes: GuestNoteRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [vip, setVip] = useState(isVip);
  const [doNotWalk, setDoNotWalk] = useState(isDoNotWalk);
  const [busyTag, setBusyTag] = useState<"vip" | "do_not_walk" | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [localNotes, setLocalNotes] = useState(notes);

  const toggleTag = async (tag: "vip" | "do_not_walk", nextEnabled: boolean) => {
    setBusyTag(tag);
    try {
      const res = await fetch(`/api/hotel/guests/${guestId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, tag, enabled: nextEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(`Could not update ${tag === "vip" ? "VIP flag" : "Do Not Walk"}`, data.error ?? "Try again.");
        return;
      }
      if (tag === "vip") setVip(nextEnabled);
      else setDoNotWalk(nextEnabled);
      toastSuccess(nextEnabled ? "Flag set" : "Flag removed");
      router.refresh();
    } finally {
      setBusyTag(null);
    }
  };

  const addNote = async () => {
    if (!noteDraft.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/hotel/guests/${guestId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, note: noteDraft.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save note", data.error ?? "Try again.");
        return;
      }
      setLocalNotes(data.notes ?? localNotes);
      setNoteDraft("");
      toastSuccess("Note saved");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Flags &amp; agent notes</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={vip ? "default" : "outline"}
            disabled={!canEdit || busyTag === "vip"}
            onClick={() => void toggleTag("vip", !vip)}
            className={cn(vip && "bg-amber-500 hover:bg-amber-600")}
          >
            {vip ? "VIP — remove" : "Mark as VIP"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={doNotWalk ? "default" : "outline"}
            disabled={!canEdit || busyTag === "do_not_walk"}
            onClick={() => void toggleTag("do_not_walk", !doNotWalk)}
            className={cn(doNotWalk && "bg-red-600 hover:bg-red-700")}
          >
            {doNotWalk ? "Do Not Walk — remove" : "Set Do Not Walk"}
          </Button>
        </div>
      </div>
      {doNotWalk ? (
        <p className="mt-2 text-xs text-red-600">
          This guest is protected from being walked (relocated) in an overbooking situation.
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-4 flex gap-2">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note that follows this guest across every stay…"
            className="min-h-[64px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <Button type="button" size="sm" disabled={savingNote || !noteDraft.trim()} onClick={() => void addNote()}>
            {savingNote ? "Saving…" : "Add note"}
          </Button>
        </div>
      ) : null}

      {localNotes.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No agent notes yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {localNotes.map((n) => (
            <li key={n.id} className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <p className="text-slate-700">{n.note}</p>
              <p className="mt-1 text-xs text-slate-400">
                {n.createdByName} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
