"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FrontDeskShiftNoteItem } from "@/lib/hms/front-desk-board";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";

function groupLabel(shiftDate: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (shiftDate === today) return "Today";
  if (shiftDate === yesterday) return "Yesterday";
  return shiftDate;
}

export function FrontDeskShiftNotes({
  slug,
  notes: initialNotes,
}: {
  slug: string;
  notes: FrontDeskShiftNoteItem[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, FrontDeskShiftNoteItem[]>();
    for (const n of notes) {
      const list = map.get(n.shiftDate) ?? [];
      list.push(n);
      map.set(n.shiftDate, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [notes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/shift-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, body: body.trim(), priority }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setBody("");
        toastSuccess("Shift note added");
        router.refresh();
      } else {
        toastError("Could not add shift note", data.error ?? "Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleResolved = async (id: string, resolved: boolean) => {
    const res = await fetch("/api/hotel/shift-notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, id, resolved: !resolved }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, resolved: !resolved } : n)));
      toastSuccess(resolved ? "Shift note reopened" : "Shift note resolved");
      router.refresh();
    } else {
      toastError("Could not update shift note", data.error ?? "Try again.");
    }
  };

  return (
    <section
      id="fd-shift-notes"
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/25 sm:p-7"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Handover</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">Shift notes</h2>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Note for the next shift…"
          rows={2}
          className="min-h-[2.75rem] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:bg-white"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          aria-label="Priority"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <Button type="submit" disabled={saving} className="h-10 shrink-0 rounded-xl">
          <MessageSquarePlus className="h-4 w-4" />
          Add
        </Button>
      </form>
      <div className="mt-5 space-y-6">
        {grouped.length === 0 ? (
          <p className="text-sm text-slate-500">No shift notes yet.</p>
        ) : (
          grouped.map(([date, items]) => (
            <div key={date}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {groupLabel(date)}
              </h3>
              <ul className="mt-3 space-y-3">
                {items.map((note) => (
                  <li
                    key={note.id}
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      note.resolved
                        ? "border-slate-100 bg-slate-50/50 opacity-70"
                        : "border-slate-200 bg-slate-50/80"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {note.priority} · {note.authorName}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg text-xs"
                        onClick={() => toggleResolved(note.id, note.resolved)}
                      >
                        {note.resolved ? "Reopen" : "Resolve"}
                      </Button>
                    </div>
                    <p className="mt-2 text-slate-800">{note.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
