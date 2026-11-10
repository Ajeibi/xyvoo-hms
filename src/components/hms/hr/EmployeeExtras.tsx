import Link from "next/link";
import { CalendarDays, Clock, Palmtree } from "lucide-react";
import { HmsCard, HmsPill } from "@/components/hms/hms-ui";
import { getEmployee } from "@/lib/hms/hr/hr-employees";
import { leaveBalances, listLeave } from "@/lib/hms/hr/hr-leave";
import { listShifts } from "@/lib/hms/hr/hr-rota";
import { addDays, entryHours, formatDay, isoToLocalDate, isoToLocalTime, LEAVE_STATUS_LABEL } from "@/lib/hms/hr/hr-shared";
import { listEntries } from "@/lib/hms/hr/hr-time";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** The person's shifts, time and leave on their record. None of it is pay or personal data. */
export async function EmployeeExtras({ slug, tenantId, employeeId }: { slug: string; tenantId: string; employeeId: string }) {
  const service = createServerSupabaseClient();
  const employee = await getEmployee(service, tenantId, employeeId);
  if (!employee) return null;
  const today = isoToLocalDate(new Date().toISOString());
  const names = new Map([[employee.id, employee.fullName]]);
  const [shifts, entries, leave, balances] = await Promise.all([
    listShifts(service, tenantId, today, addDays(today, 13), { employeeId, names }),
    listEntries(service, tenantId, addDays(today, -13), today, { employeeId, names }),
    listLeave(service, tenantId, { employeeId, from: addDays(today, -90), limit: 20 }),
    leaveBalances(service, tenantId, [employee], Number(today.slice(0, 4))),
  ]);
  const bal = balances.get(employee.id) ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <HmsCard title="Next two weeks" icon={CalendarDays} meaning="team">
        {shifts.length === 0 ? (
          <p className="text-sm text-slate-600">No shifts planned.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {shifts.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>{formatDay(s.shiftDate)}</span>
                <span className="tabular-nums text-slate-700">
                  {isoToLocalTime(s.startsAt)}–{isoToLocalTime(s.endsAt)} {s.status === "draft" ? <HmsPill>Draft</HmsPill> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/hms/${slug}/hr/rota`} className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Open the rota
        </Link>
      </HmsCard>
      <HmsCard title="Last two weeks" icon={Clock} meaning="team">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-600">No clock-ins.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>{formatDay(isoToLocalDate(e.clockIn))}</span>
                <span className="tabular-nums text-slate-700">
                  {isoToLocalTime(e.clockIn)}–{e.clockOut ? isoToLocalTime(e.clockOut) : "now"} · {entryHours(e)}h{e.lateMinutes ? <span className="text-amber-800"> · late</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </HmsCard>
      <HmsCard title="Leave" icon={Palmtree} meaning="team">
        {bal.length ? (
          <ul className="mb-2 space-y-0.5 text-sm">
            {bal.map((b) => (
              <li key={b.leaveTypeId} className="flex justify-between gap-2">
                <span className="text-slate-700">{b.name}</span>
                <span className="font-semibold tabular-nums">{b.remaining} left</span>
              </li>
            ))}
          </ul>
        ) : null}
        {leave.length ? (
          <ul className="space-y-0.5 border-t border-slate-100 pt-2 text-sm">
            {leave.map((l) => (
              <li key={l.id} className="text-slate-700">
                {l.leaveTypeName}: {formatDay(l.startDate)}–{formatDay(l.endDate)} · {LEAVE_STATUS_LABEL[l.status]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No leave recently.</p>
        )}
      </HmsCard>
    </div>
  );
}
