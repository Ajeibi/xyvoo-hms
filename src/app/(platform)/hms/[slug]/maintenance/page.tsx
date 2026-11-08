import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, DoorClosed, Gauge, Wrench } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile, hmsButton } from "@/components/hms/hms-ui";
import { DueText, MaintenanceSubNav, PriorityPill, StatusPill } from "@/components/hms/maintenance/maint-ui";
import { formatDateTime, whereOf } from "@/lib/hms/maintenance-shared";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { generateDueSchedules } from "@/lib/hms/maintenance-schedules";
import { loadDashboard } from "@/lib/hms/maintenance-page";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MaintenancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="maintenance">
        <HmsPage>
          <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Maintenance" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  // Planned jobs that have come due are raised here too, so nothing waits for the daily job.
  try {
    await generateDueSchedules(service, tenant.id);
  } catch (e) {
    console.warn("[maintenance dashboard] schedules", e);
  }
  const d = await loadDashboard(service, tenant.id);
  const base = `/hms/${slug}/maintenance`;

  return (
    <HMSLayout slug={slug} requiredSection="maintenance">
      <HmsPage wide>
        <HmsPageHeader
          eyebrow="Maintenance"
          meaning="care"
          title="Maintenance"
          description="Faults, repairs and planned servicing in one place."
          actions={
            <Link href={`${base}/orders?new=1`} className={hmsButton.primary}>
              Report a fault
            </Link>
          }
        />
        <MaintenanceSubNav slug={slug} />

        <HmsStatStrip label="Maintenance figures">
          <HmsStatTile label="Open jobs" value={d.open} hint={`${d.unassigned} with nobody assigned`} icon={Wrench} meaning="care" href={`${base}/orders`} />
          <HmsStatTile
            label="Overdue"
            value={d.overdue}
            hint="Past their target time"
            icon={Clock}
            meaning="attention"
            href={`${base}/orders`}
            status={d.overdue > 0 ? "critical" : undefined}
            statusText="Late"
          />
          <HmsStatTile label="Urgent" value={d.urgent} hint={`${d.onHold} on hold`} icon={AlertTriangle} meaning="attention" href={`${base}/orders?priority=urgent`} status={d.urgent > 0 ? "warning" : undefined} />
          <HmsStatTile label="Rooms out of order" value={d.roomsOutOfOrder} hint="Blocked from sale" icon={DoorClosed} meaning="rooms" />
        </HmsStatStrip>
        <HmsStatStrip label="Last 30 days" columns={3}>
          <HmsStatTile label="Done this week" value={d.completedThisWeek} icon={CheckCircle2} meaning="care" />
          <HmsStatTile label="Average time to fix" value={d.avgFixHours === null ? "No data" : `${d.avgFixHours}h`} hint="Raised to done, last 30 days" icon={Gauge} meaning="care" />
          <HmsStatTile label="Fixed on time" value={d.slaKeptPercent === null ? "No data" : `${d.slaKeptPercent}%`} hint="Done before the target time" icon={CheckCircle2} meaning="care" />
        </HmsStatStrip>

        {d.blockedWithoutOrder.length > 0 ? (
          <HmsCard
            id="blocked"
            title="Rooms blocked with no work order"
            description="The front desk has taken these rooms out of sale, but nobody has a job to fix them."
            icon={DoorClosed}
            meaning="attention"
          >
            <ul className="divide-y divide-slate-100">
              {d.blockedWithoutOrder.map((b) => (
                <li key={b.blockId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-semibold text-slate-900">Room {b.roomCode}</span> · {b.reason} <span className="text-slate-500">(since {formatDateTime(b.since)})</span>
                  </span>
                  <Link
                    href={`${base}/orders?new=1&roomUnitId=${b.roomUnitId}&title=${encodeURIComponent(b.reason)}`}
                    className={hmsButton.small}
                  >
                    Create work order
                  </Link>
                </li>
              ))}
            </ul>
          </HmsCard>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HmsCard flush title="Needs attention" description="Overdue, urgent or unassigned jobs." icon={AlertTriangle} meaning="attention">
              {d.attention.length === 0 ? (
                <HmsEmptyState bare icon={CheckCircle2} meaning="care" title="Nothing needs attention" description="No overdue, urgent or unassigned jobs." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {d.attention.map((wo) => (
                    <li key={wo.id} className="px-3 py-3 sm:px-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`${base}/orders/${wo.id}`} className="font-semibold text-slate-900 hover:underline">
                          {wo.title}
                        </Link>
                        <PriorityPill priority={wo.priority} />
                        <StatusPill status={wo.status} />
                      </div>
                      <p className="text-sm text-slate-600">
                        {wo.woNumber} · {whereOf(wo)} · {wo.technicianName ? `With ${wo.technicianName}` : "Nobody assigned"} · <DueText wo={wo} />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </HmsCard>
          </div>
          <div className="space-y-4">
            <HmsCard title="Planned this week" description="Jobs coming due in the next 7 days.">
              {d.overdueSchedules.length === 0 && d.dueSoon.length === 0 ? (
                <p className="text-sm text-slate-600">Nothing planned for the next week.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {d.overdueSchedules.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-900">{s.title}</span>
                      <HmsPill tone="red">Due {s.nextDue}</HmsPill>
                    </li>
                  ))}
                  {d.dueSoon.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-900">{s.title}</span>
                      <HmsPill tone="blue">{s.nextDue}</HmsPill>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`${base}/planned`} className={`${hmsButton.quiet} mt-2`}>
                See all planned jobs
              </Link>
            </HmsCard>
            <HmsCard title="Who has what" description="Open jobs per technician.">
              {d.workload.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No technicians yet.{" "}
                  <Link href={`${base}/settings`} className="font-medium text-blue-700 underline">
                    Add them in settings
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {d.workload.map((w) => (
                    <li key={w.technicianId} className="flex items-center justify-between gap-2">
                      <Link href={`${base}/orders?technicianId=${w.technicianId}`} className="text-slate-900 hover:underline">
                        {w.name}
                      </Link>
                      <span className="tabular-nums text-slate-600">{w.open} open</span>
                    </li>
                  ))}
                </ul>
              )}
            </HmsCard>
          </div>
        </div>
      </HmsPage>
    </HMSLayout>
  );
}
