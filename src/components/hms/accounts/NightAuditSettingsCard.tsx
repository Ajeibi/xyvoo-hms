"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { NO_SHOW_MODE_LABEL, type NightAuditSettings, type NoShowMode } from "@/lib/hms/night-audit-settings-shared";
import { HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const checkbox = "h-4 w-4 rounded border-slate-300 accent-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

function hourLabel(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

/** How the hotel's night audit behaves: automatic run, no-shows, the report email, and where the business date starts. */
export function NightAuditSettingsCard({ slug, settings, businessDate, today }: { slug: string; settings: NightAuditSettings; businessDate: string; today: string }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof NightAuditSettings>(key: K, value: NightAuditSettings[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/accounts/night-audit/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...form, startDate: form.startDate || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Night audit settings saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <HmsCard id="night-audit-settings-shared" title="Night audit settings" icon={Settings2} meaning="money" className="print:hidden">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Run by itself</legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className={`${checkbox} mt-0.5`} checked={form.autoRun} onChange={(e) => set("autoRun", e.target.checked)} />
            <span>Close the day automatically if nobody has. Things left open don&apos;t stop it; they are listed in the report.</span>
          </label>
          <HmsField id="na-hour" label="Close the previous day from">
            <select id="na-hour" className={hmsInput} value={form.autoRunHour} disabled={!form.autoRun} onChange={(e) => set("autoRunHour", Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)} hotel time
                </option>
              ))}
            </select>
          </HmsField>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Guests who don&apos;t arrive</legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className={`${checkbox} mt-0.5`} checked={form.processNoShows} onChange={(e) => set("processNoShows", e.target.checked)} />
            <span>Handle no-shows when the day is closed</span>
          </label>
          <HmsField id="na-noshow" label="What happens to them">
            <select id="na-noshow" className={hmsInput} value={form.noShowMode} disabled={!form.processNoShows} onChange={(e) => set("noShowMode", e.target.value as NoShowMode)}>
              {(Object.keys(NO_SHOW_MODE_LABEL) as NoShowMode[]).map((m) => (
                <option key={m} value={m}>
                  {NO_SHOW_MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </HmsField>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">End-of-day report</legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className={`${checkbox} mt-0.5`} checked={form.emailReport} onChange={(e) => set("emailReport", e.target.checked)} />
            <span>Email the report to the owners and admins when a day is closed</span>
          </label>
          <HmsField id="na-recipients" label="Also send to" hint="Email addresses, separated by commas">
            <input id="na-recipients" className={hmsInput} value={form.extraRecipients} disabled={!form.emailReport} onChange={(e) => set("extraRecipients", e.target.value)} />
          </HmsField>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Room revenue</legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className={`${checkbox} mt-0.5`}
              checked={form.nightlyRoomRevenue}
              disabled={Boolean(settings.nightlyRevenueFrom)}
              onChange={(e) => set("nightlyRoomRevenue", e.target.checked)}
            />
            <span>
              Earn each stay&apos;s room charge night by night. It is held in Deferred Revenue when posted and moved to Room Revenue as each night passes.
              {settings.nightlyRevenueFrom ? ` Started on ${settings.nightlyRevenueFrom}; it stays on.` : " It starts with the next day you close, for stays that begin from then on."}
            </span>
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Business date</legend>
          <p className="text-sm text-slate-600">
            It is {businessDate} now. It moves on by itself each time a day is closed. To skip a stretch nobody will close (say, a hotel starting out), choose the day it should start from.
          </p>
          <HmsField id="na-start" label="Start from">
            <input id="na-start" type="date" max={today} className={hmsInput} value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} />
          </HmsField>
        </fieldset>
      </div>
      <div className="mt-5">
        <button type="button" className={hmsButton.primary} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </HmsCard>
  );
}
