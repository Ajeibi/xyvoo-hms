"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Send } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callHr } from "@/components/hms/hr/hr-ui";
import { addDays, formatDay, isoToLocalTime, naira, type Employee, type Shift, type ShiftTemplate, type ShiftWarning } from "@/lib/hms/hr/hr-shared";

type Totals = { date: string; hours: number; cost: number | null; open: number }[];

type Draft = {
  id?: string;
  employeeId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  position: string;
  notes: string;
};

export function RotaClient(p: {
  slug: string;
  start: string;
  dates: string[];
  today: string;
  department: string | null;
  departments: string[];
  employees: Employee[];
  shifts: Shift[];
  warnings: Record<string, ShiftWarning[]>;
  templates: ShiftTemplate[];
  totals: Totals;
  personHours: Record<string, number>;
  showCost: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const base = `/hms/${p.slug}/hr/rota`;
  const q = (week: string) => `${base}?week=${week}${p.department ? `&dept=${encodeURIComponent(p.department)}` : ""}`;
  const drafts = p.shifts.filter((s) => s.status === "draft").length;
  const warnCount = Object.keys(p.warnings).length;

  function openNew(date: string, employeeId: string) {
    const t = p.templates[0];
    setError("");
    setDraft({ employeeId, shiftDate: date, startTime: t?.startTime ?? "08:00", endTime: t?.endTime ?? "16:00", breakMinutes: String(t?.breakMinutes ?? 30), position: t?.position ?? "", notes: "" });
  }
  function openEdit(s: Shift) {
    setError("");
    setDraft({
      id: s.id,
      employeeId: s.employeeId ?? "",
      shiftDate: s.shiftDate,
      startTime: isoToLocalTime(s.startsAt),
      endTime: isoToLocalTime(s.endsAt),
      breakMinutes: String(s.breakMinutes),
      position: s.position ?? "",
      notes: s.notes ?? "",
    });
  }

  async function send(body: Record<string, unknown>, done?: (d: Record<string, unknown> | null) => string) {
    setBusy(true);
    setError("");
    setMessage("");
    const { error: err, data } = await callHr<Record<string, unknown>>("/api/hotel/hr/rota", "POST", { slug: p.slug, ...body });
    setBusy(false);
    if (err) {
      setError(err);
      return false;
    }
    if (done) setMessage(done(data));
    router.refresh();
    return true;
  }

  async function saveDraft(ev: React.FormEvent) {
    ev.preventDefault();
    if (!draft) return;
    const ok = await send({
      action: draft.id ? "update" : "create",
      id: draft.id,
      employeeId: draft.employeeId || null,
      department: p.department,
      shiftDate: draft.shiftDate,
      startTime: draft.startTime,
      endTime: draft.endTime,
      breakMinutes: Number(draft.breakMinutes) || 0,
      position: draft.position || null,
      notes: draft.notes || null,
    });
    if (ok) setDraft(null);
  }

  const rows: { id: string; label: string; sub: string | null }[] = [
    ...p.employees.map((e) => ({ id: e.id, label: e.fullName, sub: `${p.personHours[e.id] ?? 0}h${e.contractedHoursWeek ? ` of ${e.contractedHoursWeek}h` : ""}` })),
    { id: "", label: "Open shifts", sub: "Nobody yet" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={q(addDays(p.start, -7))} className={hmsButton.small} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <p className="min-w-[12rem] text-center text-sm font-semibold text-slate-900">
          {formatDay(p.dates[0])} to {formatDay(p.dates[6])}
        </p>
        <Link href={q(addDays(p.start, 7))} className={hmsButton.small} aria-label="Next week">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link href={q(p.today)} className={hmsButton.quiet}>
          This week
        </Link>
        <label className="sr-only" htmlFor="rota-dept">
          Department
        </label>
        <select
          id="rota-dept"
          className={`${hmsInput} max-w-[14rem]`}
          value={p.department ?? ""}
          onChange={(e) => router.push(`${base}?week=${p.start}${e.target.value ? `&dept=${encodeURIComponent(e.target.value)}` : ""}`)}
        >
          <option value="">All departments</option>
          {p.departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className={hmsButton.secondary}
            disabled={busy}
            onClick={() => void send({ action: "copy_week", fromStart: addDays(p.start, -7), toStart: p.start, department: p.department }, (d) => `Copied ${d?.copied ?? 0} shifts from last week${d?.skipped ? `; ${d.skipped} skipped because they would double-book` : ""}.`)}
          >
            <Copy className="h-4 w-4" aria-hidden /> Copy last week
          </button>
          <button
            type="button"
            className={hmsButton.primary}
            disabled={busy || drafts === 0}
            onClick={() => void send({ action: "publish", from: p.dates[0], to: p.dates[6], department: p.department }, (d) => `Published ${d?.published ?? 0} shifts and emailed ${d?.emailed ?? 0} people.`)}
          >
            <Send className="h-4 w-4" aria-hidden /> Publish {drafts ? `${drafts} draft${drafts === 1 ? "" : "s"}` : "week"}
          </button>
        </div>
      </div>

      {warnCount ? (
        <p className="flex items-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" aria-hidden /> {warnCount} shift{warnCount === 1 ? " needs" : "s need"} a look before you publish (marked below).
        </p>
      ) : null}
      <HmsAlert message={error} />
      {message ? (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      {draft ? (
        <HmsCard title={draft.id ? "Change shift" : "New shift"} icon={CalendarDays} meaning="team">
          <form onSubmit={saveDraft} className="grid gap-3 sm:grid-cols-3">
            {p.templates.length ? (
              <div className="sm:col-span-3">
                <p className="mb-1 text-sm font-medium text-slate-800">Shift types</p>
                <div className="flex flex-wrap gap-2">
                  {p.templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={hmsButton.small}
                      onClick={() => setDraft((d) => (d ? { ...d, startTime: t.startTime, endTime: t.endTime, breakMinutes: String(t.breakMinutes), position: t.position ?? d.position } : d))}
                    >
                      {t.name} ({t.startTime}–{t.endTime})
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <HmsField id="s-who" label="Who">
              <select id="s-who" className={hmsInput} value={draft.employeeId} onChange={(e) => setDraft({ ...draft, employeeId: e.target.value })}>
                <option value="">Open shift (nobody yet)</option>
                {p.employees
                  .filter((e) => e.status === "active")
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
              </select>
            </HmsField>
            <HmsField id="s-date" label="Day">
              <input id="s-date" type="date" required className={hmsInput} value={draft.shiftDate} onChange={(e) => setDraft({ ...draft, shiftDate: e.target.value })} />
            </HmsField>
            <HmsField id="s-pos" label="Position" optional>
              <input id="s-pos" className={hmsInput} value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} placeholder="e.g. Night auditor" />
            </HmsField>
            <HmsField id="s-start" label="Starts">
              <input id="s-start" type="time" required className={hmsInput} value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
            </HmsField>
            <HmsField id="s-end" label="Ends" hint="Earlier than the start means it ends the next day.">
              <input id="s-end" type="time" required className={hmsInput} value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
            </HmsField>
            <HmsField id="s-break" label="Unpaid break (minutes)">
              <input id="s-break" type="number" min={0} max={240} className={hmsInput} value={draft.breakMinutes} onChange={(e) => setDraft({ ...draft, breakMinutes: e.target.value })} />
            </HmsField>
            <div className="sm:col-span-3">
              <HmsField id="s-notes" label="Note" optional>
                <input id="s-notes" className={hmsInput} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </HmsField>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <button type="submit" className={hmsButton.primary} disabled={busy}>
                {busy ? "Saving…" : "Save shift"}
              </button>
              <button type="button" className={hmsButton.secondary} onClick={() => setDraft(null)}>
                Cancel
              </button>
              {draft.id ? (
                <button type="button" className={`${hmsButton.danger} ml-auto`} disabled={busy} onClick={async () => (await send({ action: "remove", id: draft.id })) && setDraft(null)}>
                  Remove shift
                </button>
              ) : null}
            </div>
          </form>
        </HmsCard>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[920px] table-fixed text-sm">
          <caption className="sr-only">Rota for the week starting {formatDay(p.dates[0])}</caption>
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th scope="col" className="w-44 px-3 py-2 text-left font-semibold">
                Person
              </th>
              {p.dates.map((d) => (
                <th key={d} scope="col" className={`px-2 py-2 text-left font-semibold ${d === p.today ? "text-violet-800" : ""}`}>
                  {formatDay(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id || "open"} className={row.id ? "" : "bg-amber-50/40"}>
                <th scope="row" className="px-3 py-2 text-left align-top font-medium text-slate-900">
                  {row.label}
                  <span className="block text-xs font-normal text-slate-500">{row.sub}</span>
                </th>
                {p.dates.map((d) => {
                  const cell = p.shifts.filter((s) => s.shiftDate === d && (s.employeeId ?? "") === row.id);
                  return (
                    <td key={d} className="px-1.5 py-1.5 align-top">
                      <div className="space-y-1">
                        {cell.map((s) => {
                          const w = p.warnings[s.id];
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => openEdit(s)}
                              title={w?.map((x) => x.message).join(" ")}
                              className={`block w-full rounded-lg border px-2 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                s.status === "draft" ? "border-dashed border-slate-400 bg-white" : "border-violet-200 bg-violet-50"
                              } ${w ? "ring-1 ring-amber-400" : ""}`}
                            >
                              <span className="font-semibold text-slate-900">
                                {isoToLocalTime(s.startsAt)}–{isoToLocalTime(s.endsAt)}
                              </span>
                              {s.position ? <span className="block truncate text-slate-600">{s.position}</span> : null}
                              {s.status === "draft" ? <span className="block text-slate-500">Draft</span> : null}
                              {w ? (
                                <span className="mt-0.5 flex items-start gap-1 text-amber-800">
                                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                                  <span>{w[0].message}</span>
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => openNew(d, row.id)}
                          className="flex w-full items-center justify-center rounded-lg py-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          aria-label={`Add a shift for ${row.label} on ${formatDay(d)}`}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50 text-xs text-slate-700">
            <tr>
              <th scope="row" className="px-3 py-2 text-left font-semibold">
                Hours{p.showCost ? " and cost" : ""}
              </th>
              {p.totals.map((t) => (
                <td key={t.date} className="px-2 py-2 tabular-nums">
                  {t.hours}h{t.open ? ` · ${t.open} open` : ""}
                  {p.showCost && t.cost !== null ? <span className="block text-slate-500">{naira(t.cost)}</span> : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {p.employees.length === 0 ? (
        <p className="text-sm text-slate-600">
          No staff here yet.{" "}
          <Link href={`/hms/${p.slug}/hr/staff?new=1`} className="font-medium text-blue-700 underline">
            Add your team
          </Link>{" "}
          first.
        </p>
      ) : null}
    </div>
  );
}
