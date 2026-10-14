"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, NotebookPen, ShieldCheck } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { GuestNoteRow } from "@/lib/hms/guest-management";
import { HmsCard, HmsEmptyState, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

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

  const toggleClass = (on: boolean, onColours: string) =>
    cn(
      "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
      focusRing,
      on ? onColours : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    );

  return (
    <HmsCard
      id="guest-flags-notes"
      icon={NotebookPen}
      meaning="guests"
      title="Flags and team notes"
      description="Notes stay with this guest across every stay, so the whole team can see them."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={vip}
            disabled={!canEdit || busyTag === "vip"}
            onClick={() => void toggleTag("vip", !vip)}
            className={toggleClass(vip, "border-amber-600 bg-amber-50 text-amber-900")}
          >
            <Crown className="h-4 w-4" aria-hidden />
            {vip ? "VIP" : "Mark as VIP"}
          </button>
          <button
            type="button"
            aria-pressed={doNotWalk}
            aria-describedby={doNotWalk ? "do-not-walk-hint" : undefined}
            disabled={!canEdit || busyTag === "do_not_walk"}
            onClick={() => void toggleTag("do_not_walk", !doNotWalk)}
            className={toggleClass(doNotWalk, "border-red-600 bg-red-50 text-red-900")}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {doNotWalk ? "Do not walk" : "Set do not walk"}
          </button>
        </div>
      }
    >
      {doNotWalk ? (
        <p id="do-not-walk-hint" className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          If the hotel is overbooked, this guest must not be moved to another hotel.
        </p>
      ) : null}
      {canEdit ? (
        <p className="mb-4 text-sm text-slate-600">Press a flag to turn it on or off.</p>
      ) : null}

      {canEdit ? (
        <div className="mb-5">
          <label htmlFor="guest-note-draft" className="mb-1 block text-sm font-medium text-slate-800">
            Add a note
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <textarea
              id="guest-note-draft"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="For example: prefers a quiet room away from the lift"
              className={`${hmsInput} min-h-[72px]`}
            />
            <button
              type="button"
              className={`${hmsButton.primary} shrink-0 ${focusRing}`}
              disabled={savingNote || !noteDraft.trim()}
              onClick={() => void addNote()}
            >
              {savingNote ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>
      ) : null}

      {localNotes.length === 0 ? (
        <HmsEmptyState bare icon={NotebookPen} meaning="guests" title="No notes yet" description="Anything worth remembering about this guest can be noted here." />
      ) : (
        <ul className="space-y-3">
          {localNotes.map((n) => (
            <li key={n.id} className="rounded-xl bg-amber-50/60 px-4 py-3 text-sm">
              <p className="text-slate-800">{n.note}</p>
              <p className="mt-1 text-xs text-slate-600">
                {n.createdByName} · {new Date(n.createdAt).toLocaleString("en-GB")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </HmsCard>
  );
}
