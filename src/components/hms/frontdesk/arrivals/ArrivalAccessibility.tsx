"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { HmsAlert, hmsButton } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import {
  ACCESSIBILITY_FLAGS,
  ACCESSIBILITY_HINTS,
  ACCESSIBILITY_LABELS,
  roomFitWarning,
  type AccessibilityFlag,
} from "@/lib/hms/accessibility-flags-shared";

export function ArrivalAccessibility({
  slug,
  reservationId,
  roomCode,
  floor,
  canEdit,
  onSaved,
}: {
  slug: string;
  reservationId: string;
  roomCode: string | null;
  floor: number | null;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const url = `/api/hotel/frontdesk/arrivals/${reservationId}/accessibility`;
  const [flags, setFlags] = useState<AccessibilityFlag[]>([]);
  const [saved, setSaved] = useState<AccessibilityFlag[]>([]);
  const [fromGuest, setFromGuest] = useState<AccessibilityFlag[]>([]);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${url}?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      const merged: AccessibilityFlag[] = json.flags ?? [];
      setFlags(merged);
      setSaved(merged);
      setFromGuest(json.guestFlags ?? []);
    } catch {
      setFlags([]);
    } finally {
      setLoading(false);
    }
  }, [url, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = flags.length !== saved.length || flags.some((f) => !saved.includes(f));
  const warning = roomFitWarning(flags, { code: roomCode, floor });

  function toggle(f: AccessibilityFlag) {
    setFlags((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, flags, rememberForGuest: remember }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save.");
        toastError("Not saved", json.error ?? "Try again.");
        return;
      }
      toastSuccess("Accessibility needs saved");
      setSaved(flags);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />;

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ACCESSIBILITY_FLAGS.map((f) => (
          <li key={f}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={flags.includes(f)} disabled={!canEdit || busy} onChange={() => toggle(f)} />
              <span>
                <span className="block font-medium text-slate-900">{ACCESSIBILITY_LABELS[f]}</span>
                <span className="block text-xs text-slate-600">{ACCESSIBILITY_HINTS[f]}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {fromGuest.length > 0 ? <p className="text-xs text-slate-600">Some of these come from the guest&apos;s profile.</p> : null}
      {warning ? (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warning}
        </p>
      ) : null}
      {error ? <HmsAlert message={error} /> : null}

      {canEdit && changed ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" className="h-4 w-4" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember for this guest&apos;s next stay
          </label>
          <button type="button" className={hmsButton.primary} disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
}
