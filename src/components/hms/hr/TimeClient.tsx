"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Pencil, Plus, UserCheck } from "lucide-react";
import { HmsAlert, HmsCard, HmsEmptyState, HmsField, HmsPill, HmsStatStrip, HmsStatTile, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callHr } from "@/components/hms/hr/hr-ui";
import { addDays, entryHours, formatDay, isoToLocalDate, isoToLocalTime, localToIso, type TimeEntry } from "@/lib/hms/hr/hr-shared";
import type { TimesheetRow } from "@/lib/hms/hr/hr-time";

type Live = { clockedIn: TimeEntry[]; missing: { shiftId: string; employeeId: string; name: string; startsAt: string }[] };

type EditState = { id?: string; employeeId: string; date: string; inTime: string; outDate: string; outTime: string; breakMinutes: string; reason: string };

export function TimeClient(p: {
  slug: string;
  start: string;
  end: string;
  today: string;
  rows: TimesheetRow[];
  live: Live;
  employees: { id: string; name: string }[];
  overtimeAfter: number;
  kioskReady: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const base = `/hms/${p.slug}/hr/time`;
  const pendingIds = p.rows.flatMap((r) => r.entries.filter((e) => e.status === "pending" && e.clockOut).map((e) => e.id));

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    const { error: err } = await callHr("/api/hotel/hr/time", "POST", { slug: p.slug, ...body });
    setBusy(false);
    if (err) {
      setError(err);
      return false;
    }
    setMessage(done);
    router.refresh();
    return true;
  }

  function startEdit(e: TimeEntry) {
    setEdit({
      id: e.id,
      employeeId: e.employeeId,
      date: isoToLocalDate(e.clockIn),
      inTime: isoToLocalTime(e.clockIn),
      outDate: e.clockOut ? isoToLocalDate(e.clockOut) : isoToLocalDate(e.clockIn),
      outTime: e.clockOut ? isoToLocalTime(e.clockOut) : "",
      breakMinutes: String(e.breakMinutes),
      reason: "",
    });
  }

  async function saveEdit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!edit) return;
    const body = {
      action: edit.id ? "edit" : "add",
      id: edit.id,
      employeeId: edit.employeeId,
      clockIn: localToIso(edit.date, edit.inTime),
      clockOut: edit.outTime ? localToIso(edit.outDate, edit.outTime) : null,
      breakMinutes: Number(edit.breakMinutes) || 0,
      reason: edit.reason,
    };
    if (await send(body, edit.id ? "Entry corrected." : "Entry added.")) setEdit(null);
  }

  return (
    <div className="space-y-4">
      {!p.kioskReady ? (
        <p className="text-sm text-slate-700">
          Staff clock in on a shared tablet.{" "}
          <Link href={`/hms/${p.slug}/hr/settings#clock`} className="font-medium text-blue-700 underline">
            Set up the clock screen in HR settings
          </Link>
          .
        </p>
      ) : null}
      <HmsStatStrip label="Right now" columns={3}>
        <HmsStatTile label="Clocked in now" value={p.live.clockedIn.length} hint={`${p.live.clockedIn.filter((c) => c.onBreak).length} on a break`} icon={UserCheck} meaning="team" />
        <HmsStatTile label="Late or missing" value={p.live.missing.length} hint="Shift started, not clocked in" icon={AlertTriangle} meaning="attention" status={p.live.missing.length ? "warning" : undefined} />
        <HmsStatTile label="To approve this week" value={pendingIds.length} hint="Finished entries" icon={CheckCircle2} meaning="team" />
      </HmsStatStrip>

      {p.live.clockedIn.length || p.live.missing.length ? (
        <HmsCard title="On shift now" icon={Clock} meaning="team">
          <ul className="space-y-1 text-sm">
            {p.live.clockedIn.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="text-slate-900">{c.employeeName}</span>
                <span className="text-slate-600">
                  {c.onBreak ? "On a break · " : ""}in since {isoToLocalTime(c.clockIn)}
                </span>
              </li>
            ))}
            {p.live.missing.map((m) => (
              <li key={m.shiftId} className="flex justify-between gap-2">
                <span className="text-slate-900">{m.name}</span>
                <HmsPill tone="red">Not in · shift began {isoToLocalTime(m.startsAt)}</HmsPill>
              </li>
            ))}
          </ul>
        </HmsCard>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`${base}?week=${addDays(p.start, -7)}`} className={hmsButton.small} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <p className="min-w-[12rem] text-center text-sm font-semibold text-slate-900">
          {formatDay(p.start)} to {formatDay(p.end)}
        </p>
        <Link href={`${base}?week=${addDays(p.start, 7)}`} className={hmsButton.small} aria-label="Next week">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className={hmsButton.secondary}
            onClick={() => setEdit({ employeeId: p.employees[0]?.id ?? "", date: p.today, inTime: "08:00", outDate: p.today, outTime: "16:00", breakMinutes: "30", reason: "" })}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add a missed entry
          </button>
          <button type="button" className={hmsButton.primary} disabled={busy || pendingIds.length === 0} onClick={() => void send({ action: "approve", ids: pendingIds }, `Approved ${pendingIds.length} entries.`)}>
            Approve all finished ({pendingIds.length})
          </button>
        </div>
      </div>
      <HmsAlert message={error} />
      {message ? (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      {edit ? (
        <HmsCard title={edit.id ? "Correct an entry" : "Add a missed entry"} description="Every change needs a reason and is kept in the audit log.">
          <form onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-4">
            {!edit.id ? (
              <div className="sm:col-span-4">
                <HmsField id="t-who" label="Who">
                  <select id="t-who" className={hmsInput} value={edit.employeeId} onChange={(e) => setEdit({ ...edit, employeeId: e.target.value })}>
                    {p.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </HmsField>
              </div>
            ) : null}
            <HmsField id="t-date" label="Day in">
              <input id="t-date" type="date" required className={hmsInput} value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
            </HmsField>
            <HmsField id="t-in" label="Clocked in">
              <input id="t-in" type="time" required className={hmsInput} value={edit.inTime} onChange={(e) => setEdit({ ...edit, inTime: e.target.value })} />
            </HmsField>
            <HmsField id="t-odate" label="Day out">
              <input id="t-odate" type="date" className={hmsInput} value={edit.outDate} onChange={(e) => setEdit({ ...edit, outDate: e.target.value })} />
            </HmsField>
            <HmsField id="t-out" label="Clocked out" hint="Leave empty if still in.">
              <input id="t-out" type="time" className={hmsInput} value={edit.outTime} onChange={(e) => setEdit({ ...edit, outTime: e.target.value })} />
            </HmsField>
            <HmsField id="t-break" label="Break (minutes)">
              <input id="t-break" type="number" min={0} max={600} className={hmsInput} value={edit.breakMinutes} onChange={(e) => setEdit({ ...edit, breakMinutes: e.target.value })} />
            </HmsField>
            <div className="sm:col-span-3">
              <HmsField id="t-why" label="Reason">
                <input id="t-why" required minLength={3} className={hmsInput} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} placeholder="e.g. Forgot to clock out" />
              </HmsField>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-4">
              <button type="submit" className={hmsButton.primary} disabled={busy}>
                Save
              </button>
              <button type="button" className={hmsButton.secondary} onClick={() => setEdit(null)}>
                Cancel
              </button>
              {edit.id ? (
                <button
                  type="button"
                  className={`${hmsButton.danger} ml-auto`}
                  disabled={busy || edit.reason.trim().length < 3}
                  onClick={async () => (await send({ action: "delete", id: edit.id, reason: edit.reason }, "Entry removed.")) && setEdit(null)}
                >
                  Remove entry
                </button>
              ) : null}
            </div>
          </form>
        </HmsCard>
      ) : null}

      <HmsCard flush title="Timesheets" description={`Overtime is hours over ${p.overtimeAfter} in a week.`} icon={Clock} meaning="team">
        {p.rows.length === 0 ? (
          <HmsEmptyState bare icon={Clock} meaning="team" title="No hours this week" description="Hours appear here as staff clock in on the clock screen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 sm:px-6">Person</th>
                  <th className="px-3 py-2 text-right">Planned</th>
                  <th className="px-3 py-2 text-right">Worked</th>
                  <th className="px-3 py-2 text-right">Overtime</th>
                  <th className="px-3 py-2">Flags</th>
                  <th className="px-3 py-2">Approval</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.rows.map((r) => {
                  const mine = r.entries.filter((e) => e.status === "pending" && e.clockOut).map((e) => e.id);
                  return (
                    <RowGroup key={r.employeeId}>
                      <tr>
                        <td className="px-3 py-2 sm:px-6">
                          <button type="button" className="font-semibold text-slate-900 hover:underline" aria-expanded={open === r.employeeId} onClick={() => setOpen(open === r.employeeId ? null : r.employeeId)}>
                            {r.name}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.scheduledHours}h</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.workedHours}h</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.overtimeHours ? `${r.overtimeHours}h` : "—"}</td>
                        <td className="space-x-1 px-3 py-2">
                          {r.late ? <HmsPill tone="amber">Late {r.late}×</HmsPill> : null}
                          {r.leftEarly ? <HmsPill tone="amber">Left early {r.leftEarly}×</HmsPill> : null}
                          {r.noShows ? <HmsPill tone="red">No-show {r.noShows}×</HmsPill> : null}
                          {r.open ? <HmsPill tone="blue">Clocked in</HmsPill> : null}
                        </td>
                        <td className="px-3 py-2">
                          {mine.length ? (
                            <button type="button" className={hmsButton.small} disabled={busy} onClick={() => void send({ action: "approve", ids: mine }, `Approved ${r.name}'s hours.`)}>
                              Approve {mine.length}
                            </button>
                          ) : r.entries.length && r.entries.every((e) => e.status === "approved") ? (
                            <HmsPill tone="green">Approved</HmsPill>
                          ) : r.open ? (
                            <span className="text-slate-600">After clock-out</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                      {open === r.employeeId ? (
                        <tr>
                          <td colSpan={6} className="bg-slate-50 px-3 py-2 sm:px-6">
                            {r.entries.length === 0 ? (
                              <p className="text-sm text-slate-600">No clock-ins this week.</p>
                            ) : (
                              <ul className="divide-y divide-slate-200 text-sm">
                                {r.entries.map((e) => (
                                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                    <span className="text-slate-800">
                                      {formatDay(isoToLocalDate(e.clockIn))} · {isoToLocalTime(e.clockIn)} to {e.clockOut ? isoToLocalTime(e.clockOut) : "now"} · {entryHours(e)}h
                                      {e.breakMinutes ? ` · ${e.breakMinutes} min break` : ""}
                                      {e.lateMinutes ? <span className="text-amber-800"> · {e.lateMinutes} min late</span> : null}
                                      {e.leftEarlyMinutes ? <span className="text-amber-800"> · left {e.leftEarlyMinutes} min early</span> : null}
                                      {!e.shiftId ? <span className="text-slate-500"> · not on the rota</span> : null}
                                      {e.editedReason ? <span className="text-slate-500"> · changed: {e.editedReason}</span> : null}
                                    </span>
                                    <span className="flex gap-1">
                                      {e.status === "approved" ? (
                                        <button type="button" className={hmsButton.quiet} disabled={busy} onClick={() => void send({ action: "reopen", ids: [e.id] }, "Reopened.")}>
                                          Reopen
                                        </button>
                                      ) : (
                                        <button type="button" className={hmsButton.quiet} onClick={() => startEdit(e)}>
                                          <Pencil className="h-3.5 w-3.5" aria-hidden /> Correct
                                        </button>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </RowGroup>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>
    </div>
  );
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
