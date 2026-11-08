"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus } from "lucide-react";
import { HmsAlert, HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callApi } from "@/components/hms/maintenance/maint-ui";
import {
  PRIORITY_LABEL,
  WO_PRIORITIES,
  describeInterval,
  type CategoryRow,
  type MaintenanceSchedule,
  type ScheduleUnit,
  type Technician,
  type WoPriority,
} from "@/lib/hms/maintenance-shared";

type Choice = { id: string; label: string };

function ScheduleForm({
  slug,
  schedule,
  rooms,
  assets,
  technicians,
  categories,
  onDone,
  onCancel,
}: {
  slug: string;
  schedule?: MaintenanceSchedule;
  rooms: Choice[];
  assets: Choice[];
  technicians: Technician[];
  categories: CategoryRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(schedule?.title ?? "");
  const [description, setDescription] = useState(schedule?.description ?? "");
  const [category, setCategory] = useState(schedule?.category ?? "");
  const [priority, setPriority] = useState<WoPriority>(schedule?.priority ?? "normal");
  const [everyN, setEveryN] = useState(String(schedule?.everyN ?? 1));
  const [unit, setUnit] = useState<ScheduleUnit>(schedule?.unit ?? "month");
  const [nextDue, setNextDue] = useState(schedule?.nextDue ?? "");
  const [leadDays, setLeadDays] = useState(String(schedule?.leadDays ?? 3));
  const [where, setWhere] = useState<"asset" | "room" | "area">(schedule?.assetId ? "asset" : schedule?.roomUnitId ? "room" : schedule ? "area" : "asset");
  const [assetId, setAssetId] = useState(schedule?.assetId ?? "");
  const [roomUnitId, setRoomUnitId] = useState(schedule?.roomUnitId ?? "");
  const [area, setArea] = useState(schedule?.locationText ?? "");
  const [technicianId, setTechnicianId] = useState(schedule?.technicianId ?? "");
  const [active, setActive] = useState(schedule?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("Say what the job is, for example 'Service the lift'.");
    if (!nextDue) return setError("Pick the next due date.");
    const n = Number(everyN);
    if (!Number.isInteger(n) || n < 1) return setError("How often must be a whole number, 1 or more.");
    if (where === "asset" && !assetId) return setError("Pick the equipment.");
    if (where === "room" && !roomUnitId) return setError("Pick the room.");
    if (where === "area" && !area.trim()) return setError("Say which area it covers.");
    setBusy(true);
    const { error: err } = await callApi("/api/hotel/maintenance/schedules", "POST", {
      slug,
      action: "save",
      id: schedule?.id,
      title,
      description: description || null,
      category: category || null,
      priority,
      everyN: n,
      unit,
      nextDue,
      leadDays: Number(leadDays) || 0,
      assetId: where === "asset" ? assetId : null,
      roomUnitId: where === "room" ? roomUnitId : null,
      locationText: where === "area" ? area : null,
      technicianId: technicianId || null,
      active,
    });
    setBusy(false);
    if (err) return setError(err);
    onDone();
  }

  return (
    <HmsCard id="schedule-form" title={schedule ? "Edit planned job" : "New planned job"} description="A work order is raised for you before each due date.">
      <form onSubmit={submit} className="space-y-4">
        <HmsAlert message={error} />
        <HmsField id="s-title" label="Job">
          <input id="s-title" className={hmsInput} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Service the generator" />
        </HmsField>
        <div className="grid gap-4 sm:grid-cols-3">
          <HmsField id="s-every" label="Repeat every">
            <input id="s-every" inputMode="numeric" className={hmsInput} value={everyN} onChange={(e) => setEveryN(e.target.value)} />
          </HmsField>
          <HmsField id="s-unit" label="Unit">
            <select id="s-unit" className={hmsInput} value={unit} onChange={(e) => setUnit(e.target.value as ScheduleUnit)}>
              <option value="day">Days</option>
              <option value="week">Weeks</option>
              <option value="month">Months</option>
              <option value="year">Years</option>
            </select>
          </HmsField>
          <HmsField id="s-due" label="Next due">
            <input id="s-due" type="date" className={hmsInput} value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </HmsField>
          <HmsField id="s-where" label="Covers">
            <select id="s-where" className={hmsInput} value={where} onChange={(e) => setWhere(e.target.value as "asset" | "room" | "area")}>
              <option value="asset">A piece of equipment</option>
              <option value="room">A guest room</option>
              <option value="area">A public area</option>
            </select>
          </HmsField>
          {where === "asset" ? (
            <HmsField id="s-asset" label="Equipment">
              <select id="s-asset" className={hmsInput} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">Choose equipment</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </HmsField>
          ) : where === "room" ? (
            <HmsField id="s-room" label="Room">
              <select id="s-room" className={hmsInput} value={roomUnitId} onChange={(e) => setRoomUnitId(e.target.value)}>
                <option value="">Choose a room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </HmsField>
          ) : (
            <HmsField id="s-area" label="Area">
              <input id="s-area" className={hmsInput} value={area} onChange={(e) => setArea(e.target.value)} maxLength={200} />
            </HmsField>
          )}
          <HmsField id="s-lead" label="Raise it this many days early">
            <input id="s-lead" inputMode="numeric" className={hmsInput} value={leadDays} onChange={(e) => setLeadDays(e.target.value)} />
          </HmsField>
          <HmsField id="s-cat" label="Type" optional>
            <select id="s-cat" className={hmsInput} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Not set</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </HmsField>
          <HmsField id="s-priority" label="Priority">
            <select id="s-priority" className={hmsInput} value={priority} onChange={(e) => setPriority(e.target.value as WoPriority)}>
              {WO_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </HmsField>
          <HmsField id="s-tech" label="Give it to" optional>
            <select id="s-tech" className={hmsInput} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">Leave unassigned</option>
              {technicians
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </HmsField>
        </div>
        <HmsField id="s-desc" label="What to check" optional>
          <textarea id="s-desc" className={hmsInput} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </HmsField>
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (untick to pause)
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={hmsButton.primary}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onCancel} className={hmsButton.secondary}>
            Cancel
          </button>
        </div>
      </form>
    </HmsCard>
  );
}

export function PlannedClient({
  slug,
  schedules,
  rooms,
  assets,
  technicians,
  categories,
  canManage,
  today,
}: {
  slug: string;
  schedules: MaintenanceSchedule[];
  rooms: Choice[];
  assets: Choice[];
  technicians: Technician[];
  categories: CategoryRow[];
  canManage: boolean;
  today: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<MaintenanceSchedule | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function runNow() {
    setBusy(true);
    setError("");
    setNotice("");
    const { error: err, data } = await callApi<{ made?: number }>("/api/hotel/maintenance/schedules", "POST", { slug, action: "run" });
    setBusy(false);
    if (err) return setError(err);
    setNotice(data?.made ? `Raised ${data.made} work ${data.made === 1 ? "order" : "orders"}.` : "Nothing is due yet.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={hmsButton.secondary} disabled={busy} onClick={runNow}>
            Raise due jobs now
          </button>
          <button type="button" className={hmsButton.primary} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New planned job
          </button>
        </div>
      ) : null}
      <HmsAlert message={error} />
      {notice ? (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}
      {editing ? (
        <ScheduleForm
          slug={slug}
          schedule={editing === "new" ? undefined : editing}
          rooms={rooms}
          assets={assets}
          technicians={technicians}
          categories={categories}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {schedules.length === 0 ? (
        <HmsEmptyState icon={CalendarClock} meaning="care" title="No planned jobs yet" description="Add recurring jobs like servicing the generator or testing fire alarms, and work orders appear before each is due." />
      ) : (
        <HmsCard flush title="Planned jobs">
          <ul className="divide-y divide-slate-100">
            {schedules.map((s) => {
              const late = s.active && s.nextDue < today;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-6">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{s.title}</span>
                      <HmsPill tone="blue">{describeInterval(s.everyN, s.unit)}</HmsPill>
                      {!s.active ? <HmsPill tone="slate">Paused</HmsPill> : null}
                      {late ? <HmsPill tone="red">Overdue</HmsPill> : null}
                    </div>
                    <p className="text-sm text-slate-600">
                      {s.assetName ?? (s.roomCode ? `Room ${s.roomCode}` : (s.locationText ?? ""))} · next due {s.nextDue} · raised {s.leadDays} days early
                      {s.technicianName ? ` · ${s.technicianName}` : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <button type="button" className={hmsButton.small} onClick={() => setEditing(s)}>
                      Edit
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </HmsCard>
      )}
    </div>
  );
}
