import type { SupabaseClient } from "@supabase/supabase-js";
import { listDocuments, listEmployees, listPayProfiles } from "@/lib/hms/hr/hr-employees";
import { listLeave } from "@/lib/hms/hr/hr-leave";
import { hourlyCost, listShifts } from "@/lib/hms/hr/hr-rota";
import { getHrSettings } from "@/lib/hms/hr/hr-settings";
import { addDays, isoToLocalDate, shiftHours, weekStart, type LeaveRequest, type Shift, type TimeEntry } from "@/lib/hms/hr/hr-shared";
import { listSwaps } from "@/lib/hms/hr/hr-swaps";
import { liveAttendance } from "@/lib/hms/hr/hr-time";

export type HrDashboard = {
  headcount: number;
  byDepartment: { department: string; people: number }[];
  noPin: number;
  onShiftToday: Shift[];
  clockedIn: TimeEntry[];
  missing: { shiftId: string; employeeId: string; name: string; startsAt: string }[];
  pendingLeave: number;
  pendingSwaps: number;
  timesheetsToApprove: number;
  hoursThisWeek: number;
  costThisWeek: number | null;
  nextWeekDrafts: number;
  nextWeekShifts: number;
  awaySoon: LeaveRequest[];
  expiring: { employeeId: string; name: string; kind: string; expiresOn: string }[] | null;
};

export async function loadHrDashboard(service: SupabaseClient, privateDb: SupabaseClient, tenantId: string, canSeePrivate: boolean): Promise<HrDashboard> {
  const settings = await getHrSettings(service, tenantId);
  const today = isoToLocalDate(new Date().toISOString());
  const wk = weekStart(today, settings.weekStartsOn);
  const employees = await listEmployees(service, tenantId);
  const active = employees.filter((e) => e.status === "active");
  const names = new Map(employees.map((e) => [e.id, e.fullName]));

  const [weekShifts, nextWeek, live, pendingLeave, swaps, awaySoon, { count: toApprove }] = await Promise.all([
    listShifts(service, tenantId, wk, addDays(wk, 6), { names }),
    listShifts(service, tenantId, addDays(wk, 7), addDays(wk, 13), { names }),
    liveAttendance(service, tenantId, employees),
    listLeave(service, tenantId, { statuses: ["pending"] }),
    listSwaps(service, tenantId, { statuses: ["accepted"] }),
    listLeave(service, tenantId, { from: today, to: addDays(today, 7), statuses: ["approved"] }),
    service
      .schema("hotel")
      .from("hr_time_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .not("clock_out", "is", null),
  ]);

  let costThisWeek: number | null = null;
  let expiring: HrDashboard["expiring"] = null;
  if (canSeePrivate) {
    const pay = await listPayProfiles(privateDb, tenantId);
    const byId = new Map(employees.map((e) => [e.id, e]));
    costThisWeek = Math.round(
      weekShifts.reduce((t, s) => t + (s.employeeId ? hourlyCost(pay.get(s.employeeId), byId.get(s.employeeId)?.contractedHoursWeek ?? null) * shiftHours(s) : 0), 0),
    );
    const soon = addDays(today, 30);
    const docs = await listDocuments(privateDb, tenantId);
    expiring = docs
      .filter((d) => d.expiresOn && d.expiresOn <= soon && byId.get(d.employeeId)?.status !== "left")
      .map((d) => ({ employeeId: d.employeeId, name: names.get(d.employeeId) ?? "Staff", kind: d.kind, expiresOn: d.expiresOn as string }))
      .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
  }

  const depts = new Map<string, number>();
  for (const e of active) depts.set(e.department ?? "No department", (depts.get(e.department ?? "No department") ?? 0) + 1);

  return {
    headcount: active.length,
    byDepartment: [...depts.entries()].map(([department, people]) => ({ department, people })).sort((a, b) => b.people - a.people),
    noPin: active.filter((e) => !e.hasPin).length,
    onShiftToday: weekShifts.filter((s) => s.shiftDate === today && s.status === "published"),
    clockedIn: live.clockedIn,
    missing: live.missing,
    pendingLeave: pendingLeave.length,
    pendingSwaps: swaps.length,
    timesheetsToApprove: toApprove ?? 0,
    hoursThisWeek: Math.round(weekShifts.reduce((t, s) => t + shiftHours(s), 0)),
    costThisWeek,
    nextWeekDrafts: nextWeek.filter((s) => s.status === "draft").length,
    nextWeekShifts: nextWeek.length,
    awaySoon,
    expiring,
  };
}
