"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HmsAlert, HmsCard, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callApi } from "@/components/hms/maintenance/maint-ui";
import { PRIORITY_LABEL, WO_PRIORITIES, type CategoryRow, type MaintenanceSettings, type Technician, type WoPriority } from "@/lib/hms/maintenance-shared";

export function MaintenanceSettingsClient({
  slug,
  settings,
  categories,
  technicians,
  canConfigure,
}: {
  slug: string;
  settings: MaintenanceSettings;
  categories: CategoryRow[];
  technicians: Technician[];
  canConfigure: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sla, setSla] = useState({
    urgent: String(settings.slaUrgentHours),
    high: String(settings.slaHighHours),
    normal: String(settings.slaNormalHours),
    low: String(settings.slaLowHours),
    repeat: String(settings.repeatFaultThreshold),
  });
  const [catName, setCatName] = useState("");
  const [catPriority, setCatPriority] = useState<WoPriority>("normal");
  const [techName, setTechName] = useState("");
  const [techPhone, setTechPhone] = useState("");
  const [techSpecialty, setTechSpecialty] = useState("");

  async function save(body: Record<string, unknown>, success: string): Promise<boolean> {
    setError("");
    setNotice("");
    setBusy(true);
    const { error: err } = await callApi("/api/hotel/maintenance/settings", "POST", { slug, ...body });
    setBusy(false);
    if (err) {
      setError(err);
      return false;
    }
    setNotice(success);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-4">
      <HmsAlert message={error} />
      {notice ? (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}
      {!canConfigure ? <p className="text-sm text-slate-600">Only Maintenance or a manager can change these.</p> : null}

      <HmsCard id="sla" title="How quickly jobs should be fixed" description="Each priority has a target time. A job that passes it turns red and staff are alerted.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save(
              {
                action: "settings",
                slaUrgentHours: Number(sla.urgent),
                slaHighHours: Number(sla.high),
                slaNormalHours: Number(sla.normal),
                slaLowHours: Number(sla.low),
                repeatFaultThreshold: Number(sla.repeat),
              },
              "Saved.",
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ["urgent", "Urgent (hours)"],
                ["high", "High (hours)"],
                ["normal", "Normal (hours)"],
                ["low", "Low (hours)"],
                ["repeat", "Repeat fault after (orders)"],
              ] as const
            ).map(([key, label]) => (
              <HmsField key={key} id={`sla-${key}`} label={label}>
                <input id={`sla-${key}`} inputMode="decimal" className={hmsInput} disabled={!canConfigure} value={sla[key]} onChange={(e) => setSla((p) => ({ ...p, [key]: e.target.value }))} />
              </HmsField>
            ))}
          </div>
          <p className="text-xs text-slate-500">A room or piece of equipment with this many orders in a year is flagged as a repeat fault.</p>
          {canConfigure ? (
            <button type="submit" disabled={busy} className={hmsButton.primary}>
              Save times
            </button>
          ) : null}
        </form>
      </HmsCard>

      <HmsCard id="technicians" title="Technicians" description="The people work orders can be given to.">
        <ul className="divide-y divide-slate-100">
          {technicians.length === 0 ? <li className="py-2 text-sm text-slate-600">No technicians yet.</li> : null}
          {technicians.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-medium text-slate-900">{t.name}</span>
                <span className="text-slate-600">
                  {t.specialty ? ` · ${t.specialty}` : ""}
                  {t.phone ? ` · ${t.phone}` : ""}
                </span>{" "}
                {!t.active ? <HmsPill tone="slate">Not working</HmsPill> : null}
              </span>
              {canConfigure ? (
                <button
                  type="button"
                  disabled={busy}
                  className={hmsButton.small}
                  onClick={() => save({ action: "technician", id: t.id, name: t.name, phone: t.phone, specialty: t.specialty, active: !t.active }, t.active ? "Marked as not working." : "Back on the list.")}
                >
                  {t.active ? "Mark as not working" : "Put back"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {canConfigure ? (
          <form
            className="mt-4 grid items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!techName.trim()) return setError("Give the technician a name.");
              if (await save({ action: "technician", name: techName, phone: techPhone || null, specialty: techSpecialty || null, active: true }, "Technician added.")) {
                setTechName("");
                setTechPhone("");
                setTechSpecialty("");
              }
            }}
          >
            <HmsField id="t-name" label="Name">
              <input id="t-name" className={hmsInput} value={techName} onChange={(e) => setTechName(e.target.value)} maxLength={120} />
            </HmsField>
            <HmsField id="t-spec" label="Speciality" optional>
              <input id="t-spec" className={hmsInput} value={techSpecialty} onChange={(e) => setTechSpecialty(e.target.value)} maxLength={80} />
            </HmsField>
            <HmsField id="t-phone" label="Phone" optional>
              <input id="t-phone" className={hmsInput} value={techPhone} onChange={(e) => setTechPhone(e.target.value)} maxLength={40} />
            </HmsField>
            <button type="submit" disabled={busy} className={hmsButton.primary}>
              Add
            </button>
          </form>
        ) : null}
      </HmsCard>

      <HmsCard id="categories" title="Types of problem" description="Choosing a type sets a sensible starting priority.">
        <ul className="divide-y divide-slate-100">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-medium text-slate-900">{c.name}</span> <span className="text-slate-600">· starts as {PRIORITY_LABEL[c.defaultPriority].toLowerCase()}</span>{" "}
                {!c.active ? <HmsPill tone="slate">Hidden</HmsPill> : null}
              </span>
              {canConfigure ? (
                <button type="button" disabled={busy} className={hmsButton.small} onClick={() => save({ action: "category", id: c.id, name: c.name, defaultPriority: c.defaultPriority, active: !c.active }, c.active ? "Hidden from the list." : "Shown again.")}>
                  {c.active ? "Hide" : "Show"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {canConfigure ? (
          <form
            className="mt-4 grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!catName.trim()) return setError("Give the type a name.");
              if (await save({ action: "category", name: catName, defaultPriority: catPriority, active: true }, "Type added.")) setCatName("");
            }}
          >
            <HmsField id="c-name" label="New type">
              <input id="c-name" className={hmsInput} value={catName} onChange={(e) => setCatName(e.target.value)} maxLength={80} />
            </HmsField>
            <HmsField id="c-priority" label="Starts as">
              <select id="c-priority" className={hmsInput} value={catPriority} onChange={(e) => setCatPriority(e.target.value as WoPriority)}>
                {WO_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </HmsField>
            <button type="submit" disabled={busy} className={hmsButton.primary}>
              Add
            </button>
          </form>
        ) : null}
      </HmsCard>
    </div>
  );
}
