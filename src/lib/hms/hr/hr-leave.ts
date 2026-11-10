import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAlert } from "@/lib/hms/alerts";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import type { HrActor } from "@/lib/hms/hr/hr-api";
import { listLeaveTypes } from "@/lib/hms/hr/hr-settings";
import { addDays, friendlyDbError, workingDaysBetween, type Employee, type LeaveRequest, type LeaveStatus, type LeaveType } from "@/lib/hms/hr/hr-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

export async function listLeave(
  service: SupabaseClient,
  tenantId: string,
  opts: { from?: string; to?: string; statuses?: LeaveStatus[]; employeeId?: string; limit?: number } = {},
): Promise<LeaveRequest[]> {
  let q = service.schema("hotel").from("hr_leave_requests").select("*, hr_leave_types(name), hr_employees(first_name, last_name, preferred_name)").eq("tenant_id", tenantId).order("start_date").limit(opts.limit ?? 2000);
  if (opts.from) q = q.gte("end_date", opts.from);
  if (opts.to) q = q.lte("start_date", opts.to);
  if (opts.statuses?.length) q = q.in("status", opts.statuses);
  if (opts.employeeId) q = q.eq("employee_id", opts.employeeId);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.hr_employees ? `${r.hr_employees.preferred_name || r.hr_employees.first_name} ${r.hr_employees.last_name}` : "Staff",
    leaveTypeId: r.leave_type_id,
    leaveTypeName: r.hr_leave_types?.name ?? "Leave",
    startDate: r.start_date,
    endDate: r.end_date,
    days: num(r.days),
    reason: r.reason ?? null,
    status: r.status,
    source: r.source,
    decisionNote: r.decision_note ?? null,
    createdAt: r.created_at,
  }));
}

export type LeaveBalance = { leaveTypeId: string; name: string; entitlement: number; carriedOver: number; adjustments: number; used: number; pending: number; remaining: number };

/** Entitlement for a year, pro-rated for someone who started during it. */
function entitlementFor(type: LeaveType, year: number, startDate: string | null): number {
  if (!startDate || Number(startDate.slice(0, 4)) < year) return type.daysPerYear;
  if (Number(startDate.slice(0, 4)) > year) return 0;
  const monthsLeft = 12 - Number(startDate.slice(5, 7)) + 1;
  return Math.round(((type.daysPerYear * monthsLeft) / 12) * 2) / 2;
}

/** Balances per person and leave type for a calendar year (leave counts in the year it starts). */
export async function leaveBalances(service: SupabaseClient, tenantId: string, employees: Employee[], year: number): Promise<Map<string, LeaveBalance[]>> {
  const types = (await listLeaveTypes(service, tenantId)).filter((t) => t.countsAgainstBalance);
  const ids = employees.map((e) => e.id);
  const out = new Map<string, LeaveBalance[]>();
  if (!ids.length || !types.length) return out;
  const [{ data: reqs }, { data: adj }] = await Promise.all([
    service.schema("hotel").from("hr_leave_requests").select("employee_id, leave_type_id, start_date, days, status").eq("tenant_id", tenantId).in("employee_id", ids).in("status", ["approved", "pending"]).gte("start_date", `${year - 1}-01-01`).lte("start_date", `${year}-12-31`),
    service.schema("hotel").from("hr_leave_adjustments").select("employee_id, leave_type_id, year, days").eq("tenant_id", tenantId).in("employee_id", ids).in("year", [year - 1, year]),
  ]);
  for (const e of employees) {
    const list: LeaveBalance[] = [];
    for (const t of types) {
      const sum = (rows: any[] | null, y: number, status?: string) =>
        (rows ?? []).filter((r) => r.employee_id === e.id && r.leave_type_id === t.id && Number(String(r.start_date).slice(0, 4)) === y && (!status || r.status === status)).reduce((s, r) => s + num(r.days), 0);
      const adjFor = (y: number) => (adj ?? []).filter((r: any) => r.employee_id === e.id && r.leave_type_id === t.id && r.year === y).reduce((s: number, r: any) => s + num(r.days), 0);
      // Carry-over needs a known start date before this year; otherwise nobody gets days they never had.
      const workedLastYear = Boolean(e.startDate && e.startDate < `${year}-01-01`);
      const lastYearLeft = workedLastYear ? entitlementFor(t, year - 1, e.startDate) + adjFor(year - 1) - sum(reqs, year - 1, "approved") : 0;
      const carriedOver = Math.max(0, Math.min(t.carryOverMax, lastYearLeft));
      const entitlement = entitlementFor(t, year, e.startDate);
      const adjustments = adjFor(year);
      const used = sum(reqs, year, "approved");
      const pending = sum(reqs, year, "pending");
      list.push({ leaveTypeId: t.id, name: t.name, entitlement, carriedOver, adjustments, used, pending, remaining: entitlement + carriedOver + adjustments - used - pending });
    }
    out.set(e.id, list);
  }
  return out;
}

export type LeaveInput = { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; days?: number | null; reason?: string | null };

export async function requestLeave(
  service: SupabaseClient,
  tenantId: string,
  employee: Employee,
  input: LeaveInput,
  source: "hr" | "kiosk",
  actor: HrActor | null,
  opts: { allowOverBalance?: boolean; approveNow?: boolean } = {},
): Promise<{ id: string | null; error: string | null; warning: string | null }> {
  if (input.endDate < input.startDate) return { id: null, error: "The last day is before the first day.", warning: null };
  const types = await listLeaveTypes(service, tenantId, { activeOnly: true });
  const type = types.find((t) => t.id === input.leaveTypeId);
  if (!type) return { id: null, error: "Choose a type of leave.", warning: null };
  const days = input.days && input.days > 0 ? input.days : workingDaysBetween(input.startDate, input.endDate);
  if (days <= 0) return { id: null, error: "Those dates hold no working days. Enter the number of days if they work weekends.", warning: null };

  const { data: clash } = await service
    .schema("hotel")
    .from("hr_leave_requests")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employee.id)
    .in("status", ["pending", "approved"])
    .lte("start_date", input.endDate)
    .gte("end_date", input.startDate)
    .limit(1);
  if (clash?.length) return { id: null, error: "There is already leave asked for or booked on some of these days.", warning: null };

  let warning: string | null = null;
  if (type.countsAgainstBalance) {
    const bal = (await leaveBalances(service, tenantId, [employee], Number(input.startDate.slice(0, 4)))).get(employee.id)?.find((b) => b.leaveTypeId === type.id);
    if (bal && days > bal.remaining) {
      if (!opts.allowOverBalance) return { id: null, error: `Only ${bal.remaining} days of ${type.name.toLowerCase()} left this year.`, warning: null };
      warning = `This takes ${employee.fullName} ${days - bal.remaining} days over their ${type.name.toLowerCase()} balance.`;
    }
  }

  const { data, error } = await service
    .schema("hotel")
    .from("hr_leave_requests")
    .insert({
      tenant_id: tenantId,
      employee_id: employee.id,
      leave_type_id: type.id,
      start_date: input.startDate,
      end_date: input.endDate,
      days,
      reason: input.reason?.trim() || null,
      source,
      created_by: actor?.userId ?? null,
      status: opts.approveNow ? "approved" : "pending",
      decided_by: opts.approveNow ? (actor?.userId ?? null) : null,
      decided_at: opts.approveNow ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) return { id: null, error: friendlyDbError(error?.message), warning: null };
  if (actor) {
    await writeAuditLog({ tenantId, actorUserId: actor.userId, action: opts.approveNow ? "hr.leave.booked" : "hr.leave.requested", entityType: "hr_leave_request", entityId: data.id, after: { employeeId: employee.id, type: type.name, startDate: input.startDate, endDate: input.endDate, days } });
  }
  if (!opts.approveNow) {
    await sendAlert({
      tenantId,
      type: "hr_leave_request",
      title: "Leave request waiting",
      body: `${employee.fullName} asked for ${days} day${days === 1 ? "" : "s"} of ${type.name.toLowerCase()} from ${input.startDate}.`,
      severity: "info",
      entityType: "hr_leave_request",
      entityId: data.id,
      department: "hr",
    });
  }
  return { id: data.id as string, error: null, warning };
}

/** Published shifts that fall inside a leave request. */
export async function shiftsDuringLeave(service: SupabaseClient, tenantId: string, employeeId: string, startDate: string, endDate: string) {
  const { data } = await service.schema("hotel").from("hr_shifts").select("id, shift_date").eq("tenant_id", tenantId).eq("employee_id", employeeId).neq("status", "cancelled").gte("shift_date", startDate).lte("shift_date", endDate);
  return (data ?? []) as { id: string; shift_date: string }[];
}

export async function decideLeave(
  service: SupabaseClient,
  tenantId: string,
  id: string,
  approve: boolean,
  note: string | null,
  releaseShifts: boolean,
  actor: HrActor,
): Promise<{ error: string | null; released: number }> {
  const { data: r } = await service.schema("hotel").from("hr_leave_requests").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!r) return { error: "Leave request not found.", released: 0 };
  if (r.status !== "pending") return { error: "This request has already been decided.", released: 0 };
  const { error } = await service
    .schema("hotel")
    .from("hr_leave_requests")
    .update({ status: approve ? "approved" : "declined", decision_note: note?.trim() || null, decided_by: actor.userId, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: friendlyDbError(error.message), released: 0 };
  let released = 0;
  if (approve && releaseShifts) {
    const clashes = await shiftsDuringLeave(service, tenantId, r.employee_id, r.start_date, r.end_date);
    if (clashes.length) {
      await service.schema("hotel").from("hr_shifts").update({ employee_id: null, updated_at: new Date().toISOString() }).in("id", clashes.map((c) => c.id));
      released = clashes.length;
    }
  }
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: approve ? "hr.leave.approved" : "hr.leave.declined", entityType: "hr_leave_request", entityId: id, after: { note, releasedShifts: released } });
  return { error: null, released };
}

/** Cancels leave. Staff can cancel their own pending or future leave; HR can cancel any. */
export async function cancelLeave(service: SupabaseClient, tenantId: string, id: string, by: { employeeId?: string; actor?: HrActor }): Promise<{ error: string | null }> {
  const { data: r } = await service.schema("hotel").from("hr_leave_requests").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!r || !["pending", "approved"].includes(r.status)) return { error: "This leave can't be cancelled." };
  if (by.employeeId) {
    if (r.employee_id !== by.employeeId) return { error: "That isn't your leave." };
    const today = new Date().toISOString().slice(0, 10);
    if (r.status === "approved" && r.start_date <= today) return { error: "Leave that has started can only be changed by a manager." };
  }
  await service.schema("hotel").from("hr_leave_requests").update({ status: "cancelled" }).eq("id", id);
  if (by.actor) await writeAuditLog({ tenantId, actorUserId: by.actor.userId, action: "hr.leave.cancelled", entityType: "hr_leave_request", entityId: id });
  return { error: null };
}

export async function addAdjustment(
  service: SupabaseClient,
  tenantId: string,
  input: { employeeId: string; leaveTypeId: string; year: number; days: number; reason: string },
  actor: HrActor,
): Promise<{ error: string | null }> {
  const { error } = await service.schema("hotel").from("hr_leave_adjustments").insert({
    tenant_id: tenantId,
    employee_id: input.employeeId,
    leave_type_id: input.leaveTypeId,
    year: input.year,
    days: input.days,
    reason: input.reason.trim(),
    created_by: actor.userId,
  });
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.leave.adjusted", entityType: "hr_employee", entityId: input.employeeId, after: input });
  return { error: null };
}

/** Unpaid leave working days per person inside a pay period, for payroll. */
export async function unpaidLeaveDays(service: SupabaseClient, tenantId: string, from: string, to: string): Promise<Map<string, number>> {
  const types = await listLeaveTypes(service, tenantId);
  const unpaid = new Set(types.filter((t) => !t.paid).map((t) => t.id));
  const out = new Map<string, number>();
  if (!unpaid.size) return out;
  const leave = await listLeave(service, tenantId, { from, to, statuses: ["approved"] });
  for (const l of leave) {
    if (!unpaid.has(l.leaveTypeId)) continue;
    const s = l.startDate < from ? from : l.startDate;
    const e = l.endDate > to ? to : l.endDate;
    const full = workingDaysBetween(l.startDate, l.endDate);
    const inside = workingDaysBetween(s, e);
    // If the request recorded a different day count (weekend workers), scale it to the part inside the period.
    const days = full > 0 ? (l.days * inside) / full : 0;
    out.set(l.employeeId, (out.get(l.employeeId) ?? 0) + days);
  }
  return out;
}

/** Who is away on each day of a range. */
export function awayByDay(leave: LeaveRequest[], from: string, to: string) {
  const days: { date: string; away: { name: string; type: string; pending: boolean }[] }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push({
      date: d,
      away: leave.filter((l) => l.startDate <= d && l.endDate >= d && (l.status === "approved" || l.status === "pending")).map((l) => ({ name: l.employeeName, type: l.leaveTypeName, pending: l.status === "pending" })),
    });
  }
  return days;
}

/* ---------- clock screen ---------- */

export async function kioskLeaveExtras(service: SupabaseClient, tenantId: string, me: Employee) {
  const year = Number(new Date().toISOString().slice(0, 4));
  const today = new Date().toISOString().slice(0, 10);
  const [types, balances, mine] = await Promise.all([
    listLeaveTypes(service, tenantId, { activeOnly: true }),
    leaveBalances(service, tenantId, [me], year),
    listLeave(service, tenantId, { employeeId: me.id, from: today, statuses: ["pending", "approved"] }),
  ]);
  return {
    types: types.map((t) => ({ id: t.id, name: t.name })),
    balances: (balances.get(me.id) ?? []).map((b) => ({ name: b.name, remaining: b.remaining })),
    requests: mine.map((l) => ({ id: l.id, type: l.leaveTypeName, startDate: l.startDate, endDate: l.endDate, days: l.days, status: l.status })),
  };
}
