import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAlert } from "@/lib/hms/alerts";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import type { HrActor } from "@/lib/hms/hr/hr-api";
import { hashPin, mapEmployee } from "@/lib/hms/hr/hr-employees";
import { getHrSettings, hashKioskToken } from "@/lib/hms/hr/hr-settings";
import { addDays, entryHours, friendlyDbError, isoToLocalDate, isoToLocalTime, shiftHours, weekStart, type Employee, type TimeEntry } from "@/lib/hms/hr/hr-shared";
import { splitOvertime } from "@/lib/hms/hr/payroll-calc";

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

type ShiftLite = { id: string; starts_at: string; ends_at: string };

export function mapEntry(r: any, name: string, shift: ShiftLite | null, graceMinutes: number): TimeEntry {
  let lateMinutes: number | null = null;
  let leftEarlyMinutes: number | null = null;
  if (shift) {
    const late = (new Date(r.clock_in).getTime() - new Date(shift.starts_at).getTime()) / 60000;
    if (late > graceMinutes) lateMinutes = Math.round(late);
    if (r.clock_out) {
      const early = (new Date(shift.ends_at).getTime() - new Date(r.clock_out).getTime()) / 60000;
      if (early > graceMinutes) leftEarlyMinutes = Math.round(early);
    }
  }
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: name,
    shiftId: r.shift_id ?? null,
    clockIn: r.clock_in,
    clockOut: r.clock_out ?? null,
    breakMinutes: num(r.break_minutes),
    onBreak: Boolean(r.break_started_at),
    source: r.source,
    status: r.status,
    editedReason: r.edited_reason ?? null,
    lateMinutes,
    leftEarlyMinutes,
    clockInPhoto: r.clock_in_photo_path ?? null,
    clockOutPhoto: r.clock_out_photo_path ?? null,
  };
}

export async function listEntries(
  service: SupabaseClient,
  tenantId: string,
  from: string,
  to: string,
  opts: { employeeId?: string; names?: Map<string, string> } = {},
): Promise<TimeEntry[]> {
  // Dates are Lagos days; widen by a day either side and trim after.
  let q = service
    .schema("hotel")
    .from("hr_time_entries")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("clock_in", `${addDays(from, -1)}T00:00:00Z`)
    .lte("clock_in", `${addDays(to, 1)}T23:59:59Z`)
    .order("clock_in")
    .limit(10000);
  if (opts.employeeId) q = q.eq("employee_id", opts.employeeId);
  const { data } = await q;
  const rows = (data ?? []).filter((r: any) => {
    const d = isoToLocalDate(r.clock_in);
    return d >= from && d <= to;
  });
  const settings = await getHrSettings(service, tenantId);
  const shiftIds = [...new Set(rows.map((r: any) => r.shift_id).filter(Boolean))] as string[];
  const { data: shifts } = shiftIds.length
    ? await service.schema("hotel").from("hr_shifts").select("id, starts_at, ends_at").eq("tenant_id", tenantId).in("id", shiftIds)
    : { data: [] as ShiftLite[] };
  const shiftMap = new Map((shifts ?? []).map((s: any) => [s.id as string, s as ShiftLite]));
  let names = opts.names;
  if (!names) {
    const { data: emps } = await service.schema("hotel").from("hr_employees").select("id, first_name, last_name, preferred_name").eq("tenant_id", tenantId);
    names = new Map((emps ?? []).map((e: any) => [e.id as string, `${e.preferred_name || e.first_name} ${e.last_name}`]));
  }
  return rows.map((r: any) => mapEntry(r, names!.get(r.employee_id) ?? "Staff", r.shift_id ? (shiftMap.get(r.shift_id) ?? null) : null, settings.lateGraceMinutes));
}

/* ---------- the clock screen ---------- */

/** The hotel a clock screen link belongs to, or null if the link is wrong or switched off. */
export async function tenantForKiosk(service: SupabaseClient, token: string): Promise<{ tenantId: string; selfService: boolean; photo: boolean } | null> {
  if (!token || token.length < 20) return null;
  const { data } = await service.schema("hotel").from("hr_settings").select("*").eq("kiosk_token_hash", hashKioskToken(token)).maybeSingle();
  if (!data || !data.kiosk_enabled) return null;
  return { tenantId: data.tenant_id as string, selfService: data.kiosk_self_service !== false, photo: Boolean(data.kiosk_photo) };
}

export async function employeeByPin(service: SupabaseClient, tenantId: string, pin: string): Promise<Employee | null> {
  if (!/^\d{4,6}$/.test(pin)) return null;
  const { data } = await service.schema("hotel").from("hr_employees").select("*").eq("tenant_id", tenantId).eq("clock_pin_hash", hashPin(tenantId, pin)).eq("status", "active").maybeSingle();
  return data ? mapEmployee(data) : null;
}

export async function openEntry(service: SupabaseClient, tenantId: string, employeeId: string): Promise<any | null> {
  const { data } = await service.schema("hotel").from("hr_time_entries").select("*").eq("tenant_id", tenantId).eq("employee_id", employeeId).is("clock_out", null).maybeSingle();
  return data ?? null;
}

/** The published shift a clock-in belongs to: one starting up to 3 hours ahead or that started within its length. */
async function matchShift(service: SupabaseClient, tenantId: string, employeeId: string, at: Date): Promise<string | null> {
  const { data } = await service
    .schema("hotel")
    .from("hr_shifts")
    .select("id, starts_at, ends_at")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId)
    .eq("status", "published")
    .lte("starts_at", new Date(at.getTime() + 3 * 3600000).toISOString())
    .gte("ends_at", at.toISOString())
    .order("starts_at")
    .limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

export type ClockAction = "clock_in" | "clock_out" | "break_start" | "break_end";

export async function clock(service: SupabaseClient, tenantId: string, employee: Employee, action: ClockAction): Promise<{ error: string | null; message: string; entryId?: string }> {
  const now = new Date();
  const open = await openEntry(service, tenantId, employee.id);
  const table = () => service.schema("hotel").from("hr_time_entries");

  if (action === "clock_in") {
    if (open) return { error: "You're already clocked in.", message: "" };
    const shiftId = await matchShift(service, tenantId, employee.id, now);
    const { data: made, error } = await table().insert({ tenant_id: tenantId, employee_id: employee.id, shift_id: shiftId, clock_in: now.toISOString(), source: "kiosk" }).select("id").single();
    if (error || !made) return { error: friendlyDbError(error?.message), message: "" };
    return { error: null, entryId: made.id as string, message: shiftId ? `Clocked in. Have a good shift, ${employee.firstName}.` : `Clocked in, ${employee.firstName}. You're not on the rota now, so a manager will check this.` };
  }
  if (!open) return { error: "You're not clocked in.", message: "" };

  if (action === "break_start") {
    if (open.break_started_at) return { error: "You're already on a break.", message: "" };
    const { error } = await table().update({ break_started_at: now.toISOString() }).eq("id", open.id);
    return error ? { error: friendlyDbError(error.message), message: "" } : { error: null, message: "Enjoy your break." };
  }

  const breakSoFar = open.break_started_at ? Math.round((now.getTime() - new Date(open.break_started_at).getTime()) / 60000) : 0;
  if (action === "break_end") {
    if (!open.break_started_at) return { error: "You're not on a break.", message: "" };
    const { error } = await table().update({ break_started_at: null, break_minutes: num(open.break_minutes) + breakSoFar }).eq("id", open.id);
    return error ? { error: friendlyDbError(error.message), message: "" } : { error: null, message: `Welcome back. Break: ${breakSoFar} minutes.` };
  }

  // clock_out
  const breakMinutes = num(open.break_minutes) + breakSoFar;
  const { error } = await table().update({ clock_out: now.toISOString(), break_started_at: null, break_minutes: breakMinutes }).eq("id", open.id);
  if (error) return { error: friendlyDbError(error.message), message: "" };
  const hours = entryHours({ clockIn: open.clock_in, clockOut: now.toISOString(), breakMinutes });
  return { error: null, entryId: open.id as string, message: `Clocked out after ${hours} hours. Thank you, ${employee.firstName}.` };
}

/* ---------- manager corrections and approval ---------- */

export async function addEntry(
  service: SupabaseClient,
  tenantId: string,
  input: { employeeId: string; clockIn: string; clockOut: string | null; breakMinutes: number; reason: string },
  actor: HrActor,
): Promise<{ error: string | null }> {
  const shiftId = await matchShift(service, tenantId, input.employeeId, new Date(input.clockIn));
  const { data, error } = await service
    .schema("hotel")
    .from("hr_time_entries")
    .insert({
      tenant_id: tenantId,
      employee_id: input.employeeId,
      shift_id: shiftId,
      clock_in: input.clockIn,
      clock_out: input.clockOut,
      break_minutes: input.breakMinutes,
      source: "manager",
      edited_reason: input.reason,
      edited_by: actor.userId,
      edited_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.time.added", entityType: "hr_time_entry", entityId: data?.id ?? null, after: { ...input } });
  return { error: null };
}

export async function editEntry(
  service: SupabaseClient,
  tenantId: string,
  id: string,
  input: { clockIn: string; clockOut: string | null; breakMinutes: number; reason: string },
  actor: HrActor,
): Promise<{ error: string | null }> {
  const { data: before } = await service.schema("hotel").from("hr_time_entries").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!before) return { error: "Time entry not found." };
  const { error } = await service
    .schema("hotel")
    .from("hr_time_entries")
    .update({
      clock_in: input.clockIn,
      clock_out: input.clockOut,
      break_minutes: input.breakMinutes,
      break_started_at: input.clockOut ? null : before.break_started_at,
      edited_reason: input.reason,
      edited_by: actor.userId,
      edited_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({
    tenantId,
    actorUserId: actor.userId,
    action: "hr.time.corrected",
    entityType: "hr_time_entry",
    entityId: id,
    before: { clockIn: before.clock_in, clockOut: before.clock_out, breakMinutes: before.break_minutes },
    after: { ...input },
  });
  return { error: null };
}

export async function setEntriesStatus(service: SupabaseClient, tenantId: string, ids: string[], status: "approved" | "pending", actor: HrActor): Promise<{ error: string | null; count: number }> {
  if (!ids.length) return { error: null, count: 0 };
  const patch =
    status === "approved"
      ? { status, approved_by: actor.userId, approved_at: new Date().toISOString() }
      : { status, approved_by: null, approved_at: null };
  let q = service.schema("hotel").from("hr_time_entries").update(patch).eq("tenant_id", tenantId).in("id", ids);
  // Only finished entries can be approved.
  if (status === "approved") q = q.not("clock_out", "is", null);
  const { data, error } = await q.select("id");
  if (error) return { error: friendlyDbError(error.message), count: 0 };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: status === "approved" ? "hr.time.approved" : "hr.time.reopened", entityType: "hr_time_entry", after: { ids } });
  return { error: null, count: data?.length ?? 0 };
}

export async function deleteEntry(service: SupabaseClient, tenantId: string, id: string, reason: string, actor: HrActor): Promise<{ error: string | null }> {
  const { data: before } = await service.schema("hotel").from("hr_time_entries").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!before) return { error: "Time entry not found." };
  if (before.status === "approved") return { error: "This entry is approved. Reopen it first." };
  const { error } = await service.schema("hotel").from("hr_time_entries").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.time.deleted", entityType: "hr_time_entry", entityId: id, before, after: { reason } });
  return { error: null };
}

/* ---------- timesheets ---------- */

export type TimesheetRow = {
  employeeId: string;
  name: string;
  scheduledHours: number;
  workedHours: number;
  regularHours: number;
  overtimeHours: number;
  late: number;
  leftEarly: number;
  noShows: number;
  pending: number;
  open: number;
  entries: TimeEntry[];
};

/** Worked against scheduled hours per person for a range, with overtime split by week. */
export async function timesheet(service: SupabaseClient, tenantId: string, from: string, to: string, employees: Employee[]): Promise<TimesheetRow[]> {
  const settings = await getHrSettings(service, tenantId);
  const names = new Map(employees.map((e) => [e.id, e.fullName]));
  const entries = await listEntries(service, tenantId, from, to, { names });
  const { data: shifts } = await service
    .schema("hotel")
    .from("hr_shifts")
    .select("id, employee_id, shift_date, starts_at, ends_at, break_minutes")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .gte("shift_date", from)
    .lte("shift_date", to)
    .not("employee_id", "is", null);
  const now = Date.now();
  const graceMs = settings.lateGraceMinutes * 60000;
  const linked = new Set(entries.map((e) => e.shiftId).filter(Boolean));

  const rows: TimesheetRow[] = [];
  for (const e of employees) {
    const mine = entries.filter((x) => x.employeeId === e.id);
    const myShifts = (shifts ?? []).filter((s: any) => s.employee_id === e.id);
    if (!mine.length && !myShifts.length) continue;
    const weekly = new Map<string, number>();
    for (const x of mine) {
      const wk = weekStart(isoToLocalDate(x.clockIn), settings.weekStartsOn);
      weekly.set(wk, (weekly.get(wk) ?? 0) + entryHours(x, now));
    }
    const split = splitOvertime([...weekly.values()], settings.overtimeAfterWeeklyHours);
    rows.push({
      employeeId: e.id,
      name: e.fullName,
      scheduledHours: Math.round(myShifts.reduce((t: number, s: any) => t + shiftHours({ startsAt: s.starts_at, endsAt: s.ends_at, breakMinutes: num(s.break_minutes) }), 0) * 100) / 100,
      workedHours: Math.round(mine.reduce((t, x) => t + entryHours(x, now), 0) * 100) / 100,
      regularHours: split.regular,
      overtimeHours: split.overtime,
      late: mine.filter((x) => x.lateMinutes).length,
      leftEarly: mine.filter((x) => x.leftEarlyMinutes).length,
      noShows: myShifts.filter((s: any) => !linked.has(s.id) && new Date(s.starts_at).getTime() + graceMs < now).length,
      pending: mine.filter((x) => x.status === "pending" && x.clockOut).length,
      open: mine.filter((x) => !x.clockOut).length,
      entries: mine,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Who is clocked in right now, and who is late or missing for a shift that has started. */
export async function liveAttendance(service: SupabaseClient, tenantId: string, employees: Employee[]) {
  const settings = await getHrSettings(service, tenantId);
  const now = new Date();
  const names = new Map(employees.map((e) => [e.id, e.fullName]));
  const { data: open } = await service.schema("hotel").from("hr_time_entries").select("*").eq("tenant_id", tenantId).is("clock_out", null);
  const clockedIn = (open ?? []).map((r: any) => mapEntry(r, names.get(r.employee_id) ?? "Staff", null, settings.lateGraceMinutes));
  const today = isoToLocalDate(now.toISOString());
  const { data: started } = await service
    .schema("hotel")
    .from("hr_shifts")
    .select("id, employee_id, starts_at, ends_at")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .gte("shift_date", addDays(today, -1))
    .lte("starts_at", new Date(now.getTime() - settings.lateGraceMinutes * 60000).toISOString())
    .gte("ends_at", now.toISOString())
    .not("employee_id", "is", null);
  const shiftIds = (started ?? []).map((s: any) => s.id as string);
  const { data: linked } = shiftIds.length
    ? await service.schema("hotel").from("hr_time_entries").select("shift_id").eq("tenant_id", tenantId).in("shift_id", shiftIds)
    : { data: [] as any[] };
  const covered = new Set((linked ?? []).map((r: any) => r.shift_id));
  const clockedInIds = new Set(clockedIn.map((c) => c.employeeId));
  const missing = (started ?? [])
    .filter((s: any) => !covered.has(s.id) && !clockedInIds.has(s.employee_id))
    .map((s: any) => ({ shiftId: s.id as string, employeeId: s.employee_id as string, name: names.get(s.employee_id) ?? "Staff", startsAt: s.starts_at as string }));
  return { clockedIn, missing };
}

/* ---------- late and no-show alerts ---------- */

/**
 * Alerts HR when someone on the published rota hasn't clocked in once their shift is past the
 * lateness grace. One alert per shift (deduplicated by the shift id). Runs when the clock screen
 * is used and when the HR dashboard is opened, at most every few minutes per hotel.
 */
export async function alertMissingStaff(service: SupabaseClient, tenantId: string): Promise<number> {
  const { data: emps } = await service.schema("hotel").from("hr_employees").select("*").eq("tenant_id", tenantId).eq("status", "active");
  const employees = (emps ?? []).map(mapEmployee);
  if (!employees.length) return 0;
  const { missing } = await liveAttendance(service, tenantId, employees);
  let sent = 0;
  for (const m of missing) {
    const r = await sendAlert({
      tenantId,
      type: "hr_not_clocked_in",
      title: `${m.name} hasn't clocked in`,
      body: `${m.name}'s shift started at ${isoToLocalTime(m.startsAt)} and they haven't clocked in yet.`,
      severity: "warning",
      entityType: "hr_shift",
      entityId: m.shiftId,
      department: "hr",
      dedupeHours: 24,
    });
    if (r.id) sent += 1;
  }
  return sent;
}

/**
 * Yesterday's no-shows (a published shift with nobody clocked in against it) and clock-ins left
 * open for over 16 hours, as one morning summary per hotel. Called by the daily HR cron.
 */
export async function alertNoShowsAndOpenEntries(service: SupabaseClient, tenantId: string): Promise<number> {
  const today = isoToLocalDate(new Date().toISOString());
  const yesterday = addDays(today, -1);
  const { data: shifts } = await service
    .schema("hotel")
    .from("hr_shifts")
    .select("id, employee_id, starts_at")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .eq("shift_date", yesterday)
    .not("employee_id", "is", null);
  const ids = (shifts ?? []).map((s: any) => s.id as string);
  const { data: linked } = ids.length ? await service.schema("hotel").from("hr_time_entries").select("shift_id, employee_id").eq("tenant_id", tenantId).in("shift_id", ids) : { data: [] as any[] };
  const covered = new Set((linked ?? []).map((r: any) => r.shift_id));
  // Approved leave that day excuses a shift left on the rota by mistake.
  const { data: leave } = await service.schema("hotel").from("hr_leave_requests").select("employee_id").eq("tenant_id", tenantId).eq("status", "approved").lte("start_date", yesterday).gte("end_date", yesterday);
  const onLeave = new Set((leave ?? []).map((r: any) => r.employee_id));
  const noShows = (shifts ?? []).filter((s: any) => !covered.has(s.id) && !onLeave.has(s.employee_id));

  const { data: open } = await service
    .schema("hotel")
    .from("hr_time_entries")
    .select("employee_id, clock_in")
    .eq("tenant_id", tenantId)
    .is("clock_out", null)
    .lt("clock_in", new Date(Date.now() - 16 * 3600000).toISOString());
  if (!noShows.length && !open?.length) return 0;

  const { data: emps } = await service.schema("hotel").from("hr_employees").select("id, first_name, last_name, preferred_name").eq("tenant_id", tenantId);
  const names = new Map((emps ?? []).map((e: any) => [e.id as string, `${e.preferred_name || e.first_name} ${e.last_name}`]));
  const parts: string[] = [];
  if (noShows.length) parts.push(`No-shows on ${yesterday}: ${noShows.map((s: any) => `${names.get(s.employee_id) ?? "Staff"} (${isoToLocalTime(s.starts_at)})`).join(", ")}.`);
  if (open?.length) parts.push(`Still clocked in from over 16 hours ago, so probably forgot to clock out: ${open.map((r: any) => names.get(r.employee_id) ?? "Staff").join(", ")}. Correct their times on the Time page.`);
  const r = await sendAlert({
    tenantId,
    type: "hr_attendance_summary",
    title: noShows.length ? `${noShows.length} no-show${noShows.length === 1 ? "" : "s"} yesterday` : "Clock-outs to correct",
    body: parts.join(" "),
    severity: "warning",
    entityType: "hr_attendance",
    // Once a day per hotel (entity ids are uuids, so the hotel's own id stands in).
    entityId: tenantId,
    department: "hr",
    dedupeHours: 20,
  });
  return r.id ? 1 : 0;
}
