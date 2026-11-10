import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { detailsPanel } from "@/lib/mail/layout";
import type { HrActor } from "@/lib/hms/hr/hr-api";
import { listEmployees } from "@/lib/hms/hr/hr-employees";
import { getHrSettings } from "@/lib/hms/hr/hr-settings";
import {
  addDays,
  checkShift,
  formatDay,
  friendlyDbError,
  isoToLocalTime,
  localToIso,
  shiftHours,
  type Employee,
  type PayProfile,
  type Shift,
  type ShiftTemplate,
  type ShiftWarning,
} from "@/lib/hms/hr/hr-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

export function mapShift(r: any, names: Map<string, string>): Shift {
  return {
    id: r.id,
    employeeId: r.employee_id ?? null,
    employeeName: r.employee_id ? (names.get(r.employee_id) ?? "Staff") : null,
    department: r.department ?? null,
    position: r.position ?? null,
    shiftDate: r.shift_date,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    breakMinutes: num(r.break_minutes),
    notes: r.notes ?? null,
    status: r.status,
  };
}

export async function employeeNames(service: SupabaseClient, tenantId: string): Promise<Map<string, string>> {
  const all = await listEmployees(service, tenantId);
  return new Map(all.map((e) => [e.id, e.fullName]));
}

export async function listShifts(
  service: SupabaseClient,
  tenantId: string,
  from: string,
  to: string,
  opts: { department?: string | null; employeeId?: string; includeCancelled?: boolean; names?: Map<string, string> } = {},
): Promise<Shift[]> {
  let q = service.schema("hotel").from("hr_shifts").select("*").eq("tenant_id", tenantId).gte("shift_date", from).lte("shift_date", to).order("starts_at").limit(5000);
  if (!opts.includeCancelled) q = q.neq("status", "cancelled");
  if (opts.department) q = q.eq("department", opts.department);
  if (opts.employeeId) q = q.eq("employee_id", opts.employeeId);
  const { data } = await q;
  const names = opts.names ?? (await employeeNames(service, tenantId));
  return (data ?? []).map((r: any) => mapShift(r, names));
}

export async function getShift(service: SupabaseClient, tenantId: string, id: string): Promise<Shift | null> {
  const { data } = await service.schema("hotel").from("hr_shifts").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!data) return null;
  return mapShift(data, await employeeNames(service, tenantId));
}

export type ShiftInput = {
  employeeId: string | null;
  department?: string | null;
  position?: string | null;
  shiftDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  notes?: string | null;
};

/** Start and end timestamps; an end time at or before the start runs into the next day. */
export function shiftTimes(date: string, start: string, end: string) {
  const startsAt = localToIso(date, start);
  const endDate = end <= start ? addDays(date, 1) : date;
  return { startsAt, endsAt: localToIso(endDate, end) };
}

export async function createShift(service: SupabaseClient, tenantId: string, input: ShiftInput, actor: HrActor): Promise<{ id: string | null; error: string | null }> {
  const { startsAt, endsAt } = shiftTimes(input.shiftDate, input.startTime, input.endTime);
  let department = input.department ?? null;
  if (!department && input.employeeId) {
    const { data } = await service.schema("hotel").from("hr_employees").select("department").eq("tenant_id", tenantId).eq("id", input.employeeId).maybeSingle();
    department = (data?.department as string | null) ?? null;
  }
  const { data, error } = await service
    .schema("hotel")
    .from("hr_shifts")
    .insert({
      tenant_id: tenantId,
      employee_id: input.employeeId,
      department,
      position: input.position?.trim() || null,
      shift_date: input.shiftDate,
      starts_at: startsAt,
      ends_at: endsAt,
      break_minutes: input.breakMinutes,
      notes: input.notes?.trim() || null,
      status: "draft",
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { id: null, error: friendlyDbError(error?.message) };
  return { id: data.id as string, error: null };
}

export async function updateShift(service: SupabaseClient, tenantId: string, id: string, input: ShiftInput, actor: HrActor): Promise<{ error: string | null }> {
  const before = await getShift(service, tenantId, id);
  if (!before) return { error: "Shift not found." };
  const { startsAt, endsAt } = shiftTimes(input.shiftDate, input.startTime, input.endTime);
  const { error } = await service
    .schema("hotel")
    .from("hr_shifts")
    .update({
      employee_id: input.employeeId,
      department: input.department ?? before.department,
      position: input.position?.trim() || null,
      shift_date: input.shiftDate,
      starts_at: startsAt,
      ends_at: endsAt,
      break_minutes: input.breakMinutes,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };
  if (before.status === "published") {
    await writeAuditLog({
      tenantId,
      actorUserId: actor.userId,
      action: "hr.shift.changed",
      entityType: "hr_shift",
      entityId: id,
      before: { employeeId: before.employeeId, startsAt: before.startsAt, endsAt: before.endsAt },
      after: { employeeId: input.employeeId, startsAt, endsAt },
    });
  }
  return { error: null };
}

/** Drafts are deleted; published shifts are cancelled so the record stays. */
export async function removeShift(service: SupabaseClient, tenantId: string, id: string, actor: HrActor): Promise<{ error: string | null }> {
  const before = await getShift(service, tenantId, id);
  if (!before) return { error: "Shift not found." };
  const q = service.schema("hotel").from("hr_shifts");
  const { error } =
    before.status === "draft"
      ? await q.delete().eq("tenant_id", tenantId).eq("id", id)
      : await q.update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };
  if (before.status !== "draft") {
    await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.shift.cancelled", entityType: "hr_shift", entityId: id, before: { employeeId: before.employeeId, startsAt: before.startsAt } });
  }
  return { error: null };
}

/** Publishes every draft in the range and emails each person their shifts for it. */
export async function publishShifts(
  service: SupabaseClient,
  tenantId: string,
  from: string,
  to: string,
  department: string | null,
  actor: HrActor,
  hotelName: string,
): Promise<{ published: number; emailed: number; error: string | null }> {
  let q = service.schema("hotel").from("hr_shifts").update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("status", "draft").gte("shift_date", from).lte("shift_date", to);
  if (department) q = q.eq("department", department);
  const { data, error } = await q.select("id, employee_id");
  if (error) return { published: 0, emailed: 0, error: "Couldn't publish the rota." };
  const touched = new Set((data ?? []).map((r: any) => r.employee_id).filter(Boolean) as string[]);
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.rota.published", entityType: "hr_rota", after: { from, to, department, shifts: data?.length ?? 0 } });

  let emailed = 0;
  if (touched.size) {
    const employees = (await listEmployees(service, tenantId)).filter((e) => touched.has(e.id) && e.workEmail && e.status === "active");
    const names = new Map(employees.map((e) => [e.id, e.fullName]));
    const shifts = await listShifts(service, tenantId, from, to, { names });
    for (const e of employees) {
      const mine = shifts.filter((s) => s.employeeId === e.id && s.status === "published");
      if (!mine.length) continue;
      const rows = mine.map((s) => ({
        label: formatDay(s.shiftDate),
        value: `${isoToLocalTime(s.startsAt)} to ${isoToLocalTime(s.endsAt)}${s.position ? ` · ${s.position}` : ""}${s.breakMinutes ? ` · ${s.breakMinutes} min break` : ""}`,
      }));
      try {
        await sendBrandedEmail({
          to: e.workEmail as string,
          subject: `${hotelName}: your shifts from ${formatDay(from)}`,
          text: `Hello ${e.fullName},\n\nYour shifts at ${hotelName}:\n${rows.map((r) => `${r.label}: ${r.value}`).join("\n")}\n\nTo swap a shift or ask for leave, use the staff clock screen.`,
          layout: {
            preheader: `${mine.length} shift${mine.length === 1 ? "" : "s"} from ${formatDay(from)}`,
            title: "Your shifts",
            intro: `Hello ${e.fullName}, here are your shifts at ${hotelName}.`,
            body: detailsPanel(rows),
            footerNote: "You get this because your manager published the rota. To swap a shift or ask for leave, use the staff clock screen.",
          },
        });
        emailed += 1;
      } catch (err) {
        console.warn("[hr rota] email", err);
      }
    }
  }
  return { published: data?.length ?? 0, emailed, error: null };
}

/** Copies a week's shifts (not cancelled ones) into another week as drafts, skipping any that would double-book. */
export async function copyWeek(service: SupabaseClient, tenantId: string, fromStart: string, toStart: string, department: string | null, actor: HrActor): Promise<{ copied: number; skipped: number }> {
  const names = await employeeNames(service, tenantId);
  const src = await listShifts(service, tenantId, fromStart, addDays(fromStart, 6), { department, names });
  const offsetDays = Math.round((new Date(`${toStart}T00:00:00Z`).getTime() - new Date(`${fromStart}T00:00:00Z`).getTime()) / 86400000);
  let copied = 0;
  let skipped = 0;
  const { data: active } = await service.schema("hotel").from("hr_employees").select("id").eq("tenant_id", tenantId).eq("status", "active");
  const activeIds = new Set((active ?? []).map((r: any) => r.id as string));
  for (const s of src) {
    const ms = offsetDays * 86400000;
    const { error } = await service.schema("hotel").from("hr_shifts").insert({
      tenant_id: tenantId,
      employee_id: s.employeeId && activeIds.has(s.employeeId) ? s.employeeId : null,
      department: s.department,
      position: s.position,
      shift_date: addDays(s.shiftDate, offsetDays),
      starts_at: new Date(new Date(s.startsAt).getTime() + ms).toISOString(),
      ends_at: new Date(new Date(s.endsAt).getTime() + ms).toISOString(),
      break_minutes: s.breakMinutes,
      notes: s.notes,
      status: "draft",
      created_by: actor.userId,
    });
    if (error) skipped += 1;
    else copied += 1;
  }
  return { copied, skipped };
}

/* ---------- warnings and cost ---------- */

/** Soft warnings for every shift in a week: leave, rest time, weekly hours, inactive people. */
export async function weekWarnings(service: SupabaseClient, tenantId: string, shifts: Shift[], employees: Employee[], from: string, to: string): Promise<Record<string, ShiftWarning[]>> {
  const settings = await getHrSettings(service, tenantId);
  const ids = [...new Set(shifts.map((s) => s.employeeId).filter(Boolean) as string[])];
  if (!ids.length) return {};
  // A wider window, so rest time and weekly hours see shifts either side of the week.
  const wideFrom = addDays(from, -7);
  const wideTo = addDays(to, 7);
  const [{ data: around }, { data: leave }] = await Promise.all([
    service.schema("hotel").from("hr_shifts").select("id, employee_id, shift_date, starts_at, ends_at, break_minutes, status").eq("tenant_id", tenantId).in("employee_id", ids).gte("shift_date", wideFrom).lte("shift_date", wideTo).neq("status", "cancelled"),
    service
      .schema("hotel")
      .from("hr_leave_requests")
      .select("employee_id, start_date, end_date, hr_leave_types(name)")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .in("employee_id", ids)
      .lte("start_date", to)
      .gte("end_date", from),
  ]);
  const status = new Map(employees.map((e) => [e.id, e.status]));
  const out: Record<string, ShiftWarning[]> = {};
  for (const s of shifts) {
    if (!s.employeeId) continue;
    const warnings = checkShift({
      shift: s,
      otherShifts: (around ?? [])
        .filter((o: any) => o.employee_id === s.employeeId)
        .map((o: any) => ({ id: o.id, startsAt: o.starts_at, endsAt: o.ends_at, breakMinutes: num(o.break_minutes), shiftDate: o.shift_date, status: o.status })),
      approvedLeave: (leave ?? [])
        .filter((l: any) => l.employee_id === s.employeeId)
        .map((l: any) => ({ startDate: l.start_date, endDate: l.end_date, leaveTypeName: l.hr_leave_types?.name ?? "Leave" })),
      minRestHours: settings.minRestHours,
      maxWeeklyHours: settings.maxWeeklyHours,
      weekStartsOn: settings.weekStartsOn,
      employeeActive: status.get(s.employeeId) === "active",
    });
    if (warnings.length) out[s.id] = warnings;
  }
  return out;
}

/** An hourly cost for a person from their pay profile (monthly pay spread over contracted hours). */
export function hourlyCost(profile: PayProfile | undefined, contractedHoursWeek: number | null): number {
  if (!profile) return 0;
  if (profile.payBasis === "hourly") return profile.hourlyRate;
  if (profile.payBasis === "daily") return profile.dailyRate / 8;
  const monthly = profile.basicMonthly + profile.housingMonthly + profile.transportMonthly + profile.otherAllowancesMonthly;
  const weekly = contractedHoursWeek && contractedHoursWeek > 0 ? contractedHoursWeek : 40;
  return monthly / ((weekly * 52) / 12);
}

export function dayTotals(shifts: Shift[], dates: string[], costOf: ((s: Shift) => number) | null) {
  return dates.map((d) => {
    const day = shifts.filter((s) => s.shiftDate === d);
    return {
      date: d,
      hours: Math.round(day.reduce((t, s) => t + shiftHours(s), 0) * 10) / 10,
      cost: costOf ? Math.round(day.reduce((t, s) => t + costOf(s), 0)) : null,
      open: day.filter((s) => !s.employeeId).length,
    };
  });
}

/* ---------- templates ---------- */

const mapTemplate = (r: any): ShiftTemplate => ({
  id: r.id,
  name: r.name,
  department: r.department ?? null,
  position: r.position ?? null,
  startTime: String(r.start_time).slice(0, 5),
  endTime: String(r.end_time).slice(0, 5),
  breakMinutes: num(r.break_minutes),
  active: r.active !== false,
});

export async function listTemplates(service: SupabaseClient, tenantId: string): Promise<ShiftTemplate[]> {
  const { data } = await service.schema("hotel").from("hr_shift_templates").select("*").eq("tenant_id", tenantId).order("start_time");
  return (data ?? []).map(mapTemplate);
}

export async function saveTemplate(
  service: SupabaseClient,
  tenantId: string,
  input: { id?: string; name: string; department?: string | null; position?: string | null; startTime: string; endTime: string; breakMinutes: number; active: boolean },
): Promise<{ error: string | null }> {
  const row = {
    tenant_id: tenantId,
    name: input.name.trim(),
    department: input.department || null,
    position: input.position?.trim() || null,
    start_time: input.startTime,
    end_time: input.endTime,
    break_minutes: input.breakMinutes,
    active: input.active,
  };
  const { error } = input.id
    ? await service.schema("hotel").from("hr_shift_templates").update(row).eq("tenant_id", tenantId).eq("id", input.id)
    : await service.schema("hotel").from("hr_shift_templates").insert(row);
  if (error) return { error: error.code === "23505" ? "There is already a shift type with that name." : "Couldn't save the shift type." };
  return { error: null };
}

export async function deleteTemplate(service: SupabaseClient, tenantId: string, id: string): Promise<{ error: string | null }> {
  const { error } = await service.schema("hotel").from("hr_shift_templates").delete().eq("tenant_id", tenantId).eq("id", id);
  return { error: error ? "Couldn't remove the shift type." : null };
}
