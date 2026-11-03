"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { HmsAlert, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  WELCOME_NOTE_DEPARTMENTS,
  WELCOME_NOTE_DEPARTMENT_LABELS,
  WELCOME_NOTE_ITEMS,
  WELCOME_TASK_PREFIX,
  type WelcomeNoteDepartment,
  type WelcomeNoteItemKey,
} from "@/lib/hms/welcome-notes";

type WelcomeTask = { id: string; requestType: string; department: string; status: string };
type WelcomeNote = { id: string; note: string | null; createdAt: string; tasks: WelcomeTask[] };

const DEPARTMENT_LABEL: Record<string, string> = {
  housekeeping: "Housekeeping",
  food_beverage: "Food and drink",
};

const TASK_TONE: Record<string, "green" | "slate" | "red" | "amber"> = {
  completed: "green",
  cancelled: "slate",
  escalated: "red",
};

export function ArrivalWelcomeNote({
  slug,
  reservationId,
  canAdd,
}: {
  slug: string;
  reservationId: string;
  canAdd: boolean;
}) {
  const [notes, setNotes] = useState<WelcomeNote[]>([]);
  const [picked, setPicked] = useState<WelcomeNoteItemKey[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [customDepartment, setCustomDepartment] = useState<WelcomeNoteDepartment>("housekeeping");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/hotel/frontdesk/arrivals/${reservationId}/welcome-note?slug=${encodeURIComponent(slug)}`,
      );
      const json = await res.json();
      setNotes(json.notes ?? []);
    } catch {
      setNotes([]);
    }
  }, [reservationId, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: WelcomeNoteItemKey) =>
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const nothingChosen = picked.length === 0 && !customLabel.trim();

  async function send() {
    if (nothingChosen || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/hotel/frontdesk/arrivals/${reservationId}/welcome-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          items: picked,
          custom: customLabel.trim() ? { label: customLabel.trim(), department: customDepartment } : undefined,
          note: message.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error ?? "Could not send the welcome note.";
        setError(msg);
        toastError("Could not send the welcome note", msg);
        return;
      }
      toastSuccess(json.sent === 1 ? "Sent to the department" : `Sent ${json.sent} tasks`);
      setPicked([]);
      setCustomLabel("");
      setMessage("");
      await load();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <p className="text-sm text-slate-600">No welcome note has been added to this booking yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-600">{formatDateTime(n.createdAt)}</p>
              {n.note ? <p className="mt-1 text-sm text-slate-800">{n.note}</p> : null}
              <ul className="mt-2 space-y-1.5">
                {n.tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-900">
                      {t.requestType.startsWith(WELCOME_TASK_PREFIX)
                        ? t.requestType.slice(WELCOME_TASK_PREFIX.length)
                        : t.requestType}
                      <span className="ml-2 font-normal text-slate-600">
                        {DEPARTMENT_LABEL[t.department] ?? t.department}
                      </span>
                    </span>
                    <span className="capitalize">
                      <HmsPill tone={TASK_TONE[t.status] ?? "blue"}>{t.status.replace(/_/g, " ")}</HmsPill>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {canAdd ? (
        <form
          className="space-y-4 border-t border-slate-100 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {WELCOME_NOTE_DEPARTMENTS.map((dept) => (
            <fieldset key={dept}>
              <legend className="text-sm font-semibold text-slate-900">{WELCOME_NOTE_DEPARTMENT_LABELS[dept]}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {WELCOME_NOTE_ITEMS.filter((i) => i.department === dept).map((item) => (
                  <label
                    key={item.key}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm text-slate-800",
                      picked.includes(item.key) ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-700"
                      checked={picked.includes(item.key)}
                      onChange={() => toggle(item.key)}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <HmsField id="welcome-custom" label="Something else" hint="Optional. Type what you want sent.">
              <input
                id="welcome-custom"
                aria-describedby="welcome-custom-hint"
                className={hmsInput}
                maxLength={80}
                placeholder="For example, a birthday banner"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
            </HmsField>
            <HmsField id="welcome-custom-dept" label="Send to">
              <select
                id="welcome-custom-dept"
                className={cn(hmsInput, "cursor-pointer")}
                value={customDepartment}
                onChange={(e) => setCustomDepartment(e.target.value as WelcomeNoteDepartment)}
              >
                {WELCOME_NOTE_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {WELCOME_NOTE_DEPARTMENT_LABELS[d]}
                  </option>
                ))}
              </select>
            </HmsField>
          </div>

          <HmsField id="welcome-message" label="Note for the team" hint="Shown on every task above, for example the guest's name for the card.">
            <textarea
              id="welcome-message"
              aria-describedby="welcome-message-hint"
              className={cn(hmsInput, "min-h-[72px]")}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </HmsField>

          {error ? <HmsAlert message={error} /> : null}

          <button type="submit" className={hmsButton.primary} disabled={nothingChosen || sending}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              "Send to departments"
            )}
          </button>
        </form>
      ) : null}
    </div>
  );
}
