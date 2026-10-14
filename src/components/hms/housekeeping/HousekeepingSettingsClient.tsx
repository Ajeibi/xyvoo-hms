"use client";

import { useId, useState } from "react";
import { ClipboardCheck, Loader2, Repeat, Timer } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { TenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";
import { HmsCard, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        className={hmsInput}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
      />
    </div>
  );
}

const POLICY_LABEL = {
  all: "Inspect every task",
  spot_check: "Spot-check a percentage",
  self: "Self-inspection",
} as const;

export function HousekeepingSettingsClient({
  slug,
  initialSettings,
  canAccessAllDepartments,
}: {
  slug: string;
  initialSettings: TenantHousekeepingSettings;
  canAccessAllDepartments: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/housekeeping/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...settings }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save settings", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Housekeeping settings saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Housekeeping"
        meaning="care"
        title="Housekeeping settings"
        description="How long each kind of clean should take, how rooms are inspected, and when tasks are escalated."
      />

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsCard
        id="hk-settings-sla"
        title="Time to finish each clean"
        description="In minutes. Tasks show as overdue once this time has passed."
        icon={Timer}
        meaning="care"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            label="Checkout clean"
            value={settings.slaCheckoutMinutes}
            min={1}
            max={480}
            onChange={(v) => setSettings((s) => ({ ...s, slaCheckoutMinutes: v }))}
          />
          <NumberField
            label="Stayover"
            value={settings.slaStayoverMinutes}
            min={1}
            max={480}
            onChange={(v) => setSettings((s) => ({ ...s, slaStayoverMinutes: v }))}
          />
          <NumberField
            label="Deep clean"
            value={settings.slaDeepCleanMinutes}
            min={1}
            max={480}
            onChange={(v) => setSettings((s) => ({ ...s, slaDeepCleanMinutes: v }))}
          />
          <NumberField
            label="Turndown"
            value={settings.slaTurndownMinutes}
            min={1}
            max={480}
            onChange={(v) => setSettings((s) => ({ ...s, slaTurndownMinutes: v }))}
          />
        </div>
      </HmsCard>

      <HmsCard
        id="hk-settings-inspection"
        title="Inspection policy"
        description="Which cleaned rooms a supervisor checks before they're ready for guests."
        icon={ClipboardCheck}
        meaning="care"
      >
        <div role="group" aria-label="Inspection policy" className="flex flex-wrap gap-2">
          {(["all", "spot_check", "self"] as const).map((policy) => {
            const on = settings.inspectionPolicy === policy;
            return (
              <button
                key={policy}
                type="button"
                aria-pressed={on}
                onClick={() => setSettings((s) => ({ ...s, inspectionPolicy: policy }))}
                className={`min-h-10 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  on ? "border-violet-600 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {POLICY_LABEL[policy]}
              </button>
            );
          })}
        </div>
        {settings.inspectionPolicy === "spot_check" ? (
          <div className="mt-4 max-w-[180px]">
            <NumberField
              label="Percentage to check"
              value={settings.spotCheckPercent}
              min={1}
              max={100}
              onChange={(v) => setSettings((s) => ({ ...s, spotCheckPercent: v }))}
            />
          </div>
        ) : null}
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={settings.selfInspectionAllowed}
            onChange={(e) => setSettings((s) => ({ ...s, selfInspectionAllowed: e.target.checked }))}
          />
          Allow an attendant to inspect their own work (for properties without a dedicated supervisor)
        </label>
      </HmsCard>

      <HmsCard
        id="hk-settings-cadence"
        title="Priority and stayover cleans"
        description="The priority escalation window, and how often occupied rooms get a stayover clean."
        icon={Repeat}
        meaning="care"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            label="Priority escalation (minutes)"
            value={settings.priorityEscalationMinutes}
            min={1}
            max={240}
            onChange={(v) => setSettings((s) => ({ ...s, priorityEscalationMinutes: v }))}
          />
          <NumberField
            label="Stayover clean every (days)"
            value={settings.stayoverCadenceDays}
            min={1}
            max={7}
            onChange={(v) => setSettings((s) => ({ ...s, stayoverCadenceDays: v }))}
          />
        </div>
      </HmsCard>

      <button type="button" className={hmsButton.primary} disabled={saving} onClick={() => void save()}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {saving ? "Saving…" : "Save settings"}
      </button>
    </HmsPage>
  );
}
