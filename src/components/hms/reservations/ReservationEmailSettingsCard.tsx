"use client";

import { useEffect, useId, useState } from "react";
import { Mail } from "lucide-react";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";

type Settings = { sendConfirmation: boolean; sendChange: boolean; sendCancellation: boolean; extraNote: string };

/** Which emails go to the guest on their own, and a line of the hotel's own to add to each. */
export function ReservationEmailSettingsCard({ slug }: { slug: string }) {
  const ids = useId();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/reservations/email-settings?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSettings(data.settings);
        setCanManage(Boolean(data.canManage));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    const res = await fetch("/api/hotel/reservations/email-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...settings }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toastError("Not saved", data.error ?? "Please try again.");
    toastSuccess("Saved", "Booking emails are saved.");
  };

  const toggle = (key: "sendConfirmation" | "sendChange" | "sendCancellation", label: string, hint: string) => (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" className="mt-1" disabled={!canManage || !settings} checked={settings?.[key] ?? true} onChange={(e) => settings && setSettings({ ...settings, [key]: e.target.checked })} />
      <span>
        <span className="block font-medium text-slate-900">{label}</span>
        <span className="block text-slate-600">{hint}</span>
      </span>
    </label>
  );

  return (
    <HmsCard
      id="booking-emails"
      icon={Mail}
      meaning="guests"
      title="Booking emails"
      description="Emails to the guest about their booking. You can always send one again from the booking, even if it is switched off here."
    >
      <div className="divide-y divide-slate-100 text-sm">
        {toggle("sendConfirmation", "Confirmation", "Sent when a booking is made, if the guest has an email address.")}
        {toggle("sendChange", "Change notice", "Sent when the dates of a booking change.")}
        {toggle("sendCancellation", "Cancellation notice", "Sent when a booking is cancelled, with any fee.")}
      </div>
      <div className="mt-3">
        <label htmlFor={`${ids}-note`} className="mb-1 block text-sm font-medium text-slate-900">
          A note to add to every email
        </label>
        <textarea
          id={`${ids}-note`}
          rows={3}
          maxLength={600}
          disabled={!canManage || !settings}
          className={hmsInput}
          placeholder="For example: Airport pick-up can be arranged. Call the front desk."
          value={settings?.extraNote ?? ""}
          onChange={(e) => settings && setSettings({ ...settings, extraNote: e.target.value })}
        />
      </div>
      {canManage ? (
        <div className="mt-3">
          <button type="button" className={hmsButton.primary} disabled={busy || !settings} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-600">Only an owner or admin can change these.</p>
      )}
    </HmsCard>
  );
}
