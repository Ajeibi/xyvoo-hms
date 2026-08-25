"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { TenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";

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
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
      />
    </label>
  );
}

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
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Housekeeping Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">SLA targets, inspection policy, and escalation window.</p>
      </div>

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800">SLA targets (minutes)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800">Inspection policy</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "spot_check", "self"] as const).map((policy) => (
            <button
              key={policy}
              type="button"
              onClick={() => setSettings((s) => ({ ...s, inspectionPolicy: policy }))}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                settings.inspectionPolicy === policy
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {policy === "all" ? "Inspect every task" : policy === "spot_check" ? "Spot-check %" : "Self-inspection"}
            </button>
          ))}
        </div>
        {settings.inspectionPolicy === "spot_check" ? (
          <div className="mt-3 max-w-[160px]">
            <NumberField
              label="Spot-check percent"
              value={settings.spotCheckPercent}
              min={1}
              max={100}
              onChange={(v) => setSettings((s) => ({ ...s, spotCheckPercent: v }))}
            />
          </div>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings.selfInspectionAllowed}
            onChange={(e) => setSettings((s) => ({ ...s, selfInspectionAllowed: e.target.checked }))}
          />
          Allow an attendant to inspect their own work (for properties without a dedicated supervisor)
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800">Priority &amp; stayover cadence</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            label="Priority escalation (min)"
            value={settings.priorityEscalationMinutes}
            min={1}
            max={240}
            onChange={(v) => setSettings((s) => ({ ...s, priorityEscalationMinutes: v }))}
          />
          <NumberField
            label="Stayover cadence (days)"
            value={settings.stayoverCadenceDays}
            min={1}
            max={7}
            onChange={(v) => setSettings((s) => ({ ...s, stayoverCadenceDays: v }))}
          />
        </div>
      </section>

      <Button className="rounded-lg" disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
