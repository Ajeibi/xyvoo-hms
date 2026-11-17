"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";

/** How long a shared screen sits idle before it locks and asks for a PIN. */
export default function IdleLockSettings({ slug, initialEnabled, initialMinutes }: { slug: string; initialEnabled: boolean; initialMinutes: number }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 1 || value > 120) {
      toastError("Check the minutes", "Use a whole number from 1 to 120.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/hotel/staff/security", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, idleLockEnabled: enabled, idleLockMinutes: value }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      toastError("Could not save", data.error || "Please try again.");
      return;
    }
    toastSuccess("Lock screen setting saved");
  };

  return (
    <form onSubmit={save}>
      <HmsCard
        id="idle-lock"
        title="Lock screen"
        description="On a shared screen, lock after it sits idle so the next person enters their own PIN. Everything done afterwards is recorded against them. Screens lock only once someone has a PIN."
        icon={Lock}
        meaning="team"
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
            Lock the screen when it is idle
          </label>
          <HmsField id="idle-lock-minutes" label="Idle minutes before locking" hint="1 to 120. Five is a good start.">
            <input id="idle-lock-minutes" type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={!enabled} className={hmsInput} />
          </HmsField>
          <button type="submit" disabled={saving} className={hmsButton.primary}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </HmsCard>
    </form>
  );
}
