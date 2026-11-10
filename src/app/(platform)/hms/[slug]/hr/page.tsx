import Link from "next/link";
import { after } from "next/server";
import { rateLimitShared } from "@/lib/rate-limit";
import { alertMissingStaff } from "@/lib/hms/hr/hr-time";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, FileWarning, Inbox, Palmtree, Repeat, UserCheck, Users } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile, HmsWarning, hmsButton } from "@/components/hms/hms-ui";
import { HrSubNav } from "@/components/hms/hr/hr-ui";
import { loadHrDashboard } from "@/lib/hms/hr/hr-dashboard";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { formatDay, isoToLocalTime, naira } from "@/lib/hms/hr/hr-shared";

export default async function HRPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadHrPage(slug);
  const header = (
    <HmsPageHeader
      eyebrow="HR"
      meaning="team"
      title="HR"
      description="Your team, the rota, time and leave, and payroll."
      actions={
        <Link href={`/hms/${slug}/hr/staff?new=1`} className={hmsButton.primary}>
          Add staff
        </Link>
      }
    />
  );
  if (!ctx) {
    return (
      <HMSLayout slug={slug} requiredSection="hr">
        <HmsPage>{header}</HmsPage>
      </HMSLayout>
    );
  }
  const d = await loadHrDashboard(ctx.service, ctx.privateDb, ctx.tenantId, ctx.canSeePrivate);
  // Alerts for anyone late, at most every 5 minutes per hotel, after the page has been sent.
  const tenantId = ctx.tenantId;
  after(async () => {
    const gate = await rateLimitShared(`hr-late-check:${tenantId}`, 1, 5 * 60_000);
    if (gate.ok) await alertMissingStaff(createServerSupabaseClient(), tenantId).catch(() => undefined);
  });
  const base = `/hms/${slug}/hr`;

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <HmsPage wide>
        {header}
        <HrSubNav slug={slug} />

        {d.headcount === 0 ? (
          <HmsEmptyState
            icon={Users}
            meaning="team"
            title="Add your team to get started"
            description="Add everyone who works at the hotel, give each person a clock PIN, then plan your first rota."
            action={
              <Link href={`${base}/staff?new=1`} className={hmsButton.primary}>
                Add staff
              </Link>
            }
          />
        ) : null}

        <HmsStatStrip label="Today">
          <HmsStatTile label="On the rota today" value={d.onShiftToday.length} hint={`${d.headcount} active staff`} icon={CalendarDays} meaning="team" href={`${base}/rota`} />
          <HmsStatTile label="Clocked in now" value={d.clockedIn.length} hint={`${d.clockedIn.filter((c) => c.onBreak).length} on a break`} icon={UserCheck} meaning="team" href={`${base}/time`} />
          <HmsStatTile
            label="Late or missing"
            value={d.missing.length}
            hint="Shift started, not clocked in"
            icon={AlertTriangle}
            meaning="attention"
            href={`${base}/time`}
            status={d.missing.length ? "warning" : undefined}
          />
          <HmsStatTile label="Hours planned this week" value={`${d.hoursThisWeek}h`} hint={d.costThisWeek !== null ? `About ${naira(d.costThisWeek)}` : "Cost hidden: no pay access"} icon={Clock} meaning="team" />
        </HmsStatStrip>
        <HmsStatStrip label="Waiting for you" columns={3}>
          <HmsStatTile label="Leave requests" value={d.pendingLeave} icon={Palmtree} meaning="team" href={`${base}/leave`} status={d.pendingLeave ? "warning" : undefined} />
          <HmsStatTile label="Swaps to approve" value={d.pendingSwaps} icon={Repeat} meaning="team" href={`${base}/rota`} status={d.pendingSwaps ? "warning" : undefined} />
          <HmsStatTile label="Hours to approve" value={d.timesheetsToApprove} hint="Finished clock-ins" icon={CheckCircle2} meaning="team" href={`${base}/time`} />
        </HmsStatStrip>

        {d.nextWeekShifts === 0 && d.headcount > 0 ? (
          <HmsWarning title="Next week has no rota yet">
            <Link href={`${base}/rota`} className="underline">
              Plan it now
            </Link>
            , or copy this week across.
          </HmsWarning>
        ) : d.nextWeekDrafts > 0 ? (
          <HmsWarning title={`${d.nextWeekDrafts} ${d.nextWeekDrafts === 1 ? "shift next week is" : "shifts next week are"} still ${d.nextWeekDrafts === 1 ? "a draft" : "drafts"}`}>
            Staff can&apos;t see them until you{" "}
            <Link href={`${base}/rota`} className="underline">
              publish the rota
            </Link>
            .
          </HmsWarning>
        ) : null}
        {d.noPin > 0 ? (
          <p className="text-sm text-slate-700">
            {d.noPin} {d.noPin === 1 ? "person has" : "people have"} no clock PIN yet. Set one on their{" "}
            <Link href={`${base}/staff`} className="font-medium text-blue-700 underline">
              staff record
            </Link>
            .
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HmsCard flush title="Today's shifts" icon={CalendarDays} meaning="team">
              {d.onShiftToday.length === 0 ? (
                <HmsEmptyState bare icon={CalendarDays} meaning="team" title="Nobody on the published rota today" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {d.onShiftToday.map((s) => {
                    const inNow = d.clockedIn.find((c) => c.employeeId === s.employeeId);
                    const missing = d.missing.find((m) => m.shiftId === s.id);
                    return (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm sm:px-6">
                        <span>
                          <span className="font-semibold text-slate-900">{s.employeeName ?? "Open shift"}</span>
                          <span className="text-slate-600">
                            {" "}
                            · {isoToLocalTime(s.startsAt)}–{isoToLocalTime(s.endsAt)}
                            {s.department ? ` · ${s.department}` : ""}
                          </span>
                        </span>
                        {inNow ? <HmsPill tone="green">In since {isoToLocalTime(inNow.clockIn)}</HmsPill> : missing ? <HmsPill tone="red">Not in</HmsPill> : !s.employeeId ? <HmsPill tone="amber">Nobody yet</HmsPill> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </HmsCard>
          </div>
          <div className="space-y-4">
            <HmsCard title="Away in the next week" icon={Palmtree} meaning="team">
              {d.awaySoon.length === 0 ? (
                <p className="text-sm text-slate-600">Nobody.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {d.awaySoon.map((l) => (
                    <li key={l.id}>
                      {l.employeeName} · {l.leaveTypeName} · {formatDay(l.startDate)}–{formatDay(l.endDate)}
                    </li>
                  ))}
                </ul>
              )}
            </HmsCard>
            <HmsCard title="Team" icon={Users} meaning="team">
              <ul className="space-y-1 text-sm">
                {d.byDepartment.map((x) => (
                  <li key={x.department} className="flex justify-between gap-2">
                    <span className="text-slate-700">{x.department}</span>
                    <span className="tabular-nums">{x.people}</span>
                  </li>
                ))}
              </ul>
            </HmsCard>
            {d.expiring && d.expiring.length ? (
              <HmsCard title="Documents to renew" icon={FileWarning} meaning="attention">
                <ul className="space-y-1 text-sm">
                  {d.expiring.map((x, i) => (
                    <li key={i}>
                      <Link href={`${base}/staff/${x.employeeId}`} className="hover:underline">
                        {x.name}
                      </Link>{" "}
                      · {x.kind} · <span className="text-red-700">{x.expiresOn}</span>
                    </li>
                  ))}
                </ul>
              </HmsCard>
            ) : null}
            {d.pendingLeave + d.pendingSwaps === 0 ? null : (
              <HmsCard title="Inbox" icon={Inbox} meaning="team">
                <p className="text-sm text-slate-700">
                  {d.pendingLeave} leave request{d.pendingLeave === 1 ? "" : "s"} and {d.pendingSwaps} swap{d.pendingSwaps === 1 ? "" : "s"} are waiting.
                </p>
              </HmsCard>
            )}
          </div>
        </div>
      </HmsPage>
    </HMSLayout>
  );
}
