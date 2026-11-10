import type { SupabaseClient } from "@supabase/supabase-js";
import { listShifts } from "@/lib/hms/hr/hr-rota";
import { openEntry } from "@/lib/hms/hr/hr-time";
import { kioskSwapExtras } from "@/lib/hms/hr/hr-swaps";
import { kioskLeaveExtras } from "@/lib/hms/hr/hr-leave";
import { addDays, isoToLocalDate, type Employee, type Shift } from "@/lib/hms/hr/hr-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type KioskState = {
  firstName: string;
  fullName: string;
  clockedIn: boolean;
  clockedInAt: string | null;
  onBreak: boolean;
  myShifts: Shift[];
  /** Filled in by the swap and leave parts of the clock screen. */
  extras: Record<string, unknown>;
};

/** What a person sees on the clock screen after typing their PIN. Nothing about pay. */
export type KioskSwapExtras = Awaited<ReturnType<typeof kioskSwapExtras>>;
export type KioskLeaveExtras = Awaited<ReturnType<typeof kioskLeaveExtras>>;

export async function kioskState(service: SupabaseClient, tenantId: string, employee: Employee, selfService = true): Promise<KioskState> {
  const today = isoToLocalDate(new Date().toISOString());
  const [open, shifts] = await Promise.all([
    openEntry(service, tenantId, employee.id),
    listShifts(service, tenantId, today, addDays(today, 13), { employeeId: employee.id, names: new Map([[employee.id, employee.fullName]]) }),
  ]);
  const myShifts = shifts.filter((s) => s.status === "published");
  const extras: Record<string, unknown> = {};
  if (selfService) {
    [extras.swaps, extras.leave] = await Promise.all([kioskSwapExtras(service, tenantId, employee, myShifts), kioskLeaveExtras(service, tenantId, employee)]);
  }
  return {
    firstName: employee.preferredName || employee.firstName,
    fullName: employee.fullName,
    clockedIn: Boolean(open),
    clockedInAt: (open as any)?.clock_in ?? null,
    onBreak: Boolean((open as any)?.break_started_at),
    myShifts,
    extras,
  };
}
