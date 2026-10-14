import { BadgeCheck, BedDouble, ClipboardList, Timer, Users } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHousekeepingDailyReport } from "@/lib/hms/housekeeping-reports";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsStatStrip, HmsStatTile } from "@/components/hms/hms-ui";

export default async function HousekeepingReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="housekeeping-reports">
        <HmsPage>
          <HmsPageHeader eyebrow="Housekeeping" meaning="care" title="Reports" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const report = await getHousekeepingDailyReport(service, tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping-reports">
      <HmsPage>
        <HmsPageHeader
          eyebrow="Housekeeping"
          meaning="care"
          title="Reports"
          description="Today's housekeeping activity, updated as tasks move."
        />

        <HousekeepingSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />

        <HmsStatStrip label="Today's housekeeping figures">
          <HmsStatTile label="Tasks today" value={report.tasksCreatedToday} hint="Created today" icon={ClipboardList} meaning="care" />
          <HmsStatTile label="Rooms ready" value={report.tasksCompletedToday} hint="Completed today" icon={BedDouble} meaning="rooms" />
          <HmsStatTile
            label="Average clean time"
            value={report.averageCleanMinutes != null ? `${report.averageCleanMinutes}m` : "—"}
            hint="Across today's cleans"
            icon={Timer}
            meaning="care"
          />
          <HmsStatTile
            label="Passed first time"
            value={report.inspectionPassRate != null ? `${report.inspectionPassRate}%` : "—"}
            hint="First-pass inspection rate"
            icon={BadgeCheck}
            meaning="team"
          />
        </HmsStatStrip>

        <HmsCard
          id="hk-report-attendants"
          title="Rooms cleaned per attendant"
          description="Today only."
          icon={Users}
          meaning="team"
          flush={report.perAttendant.length > 0}
        >
          {report.perAttendant.length === 0 ? (
            <HmsEmptyState
              bare
              art="page"
              meaning="care"
              title="No completed rooms yet today"
              description="Each attendant's total appears here as they finish rooms."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {report.perAttendant.map((a) => (
                <li key={a.name} className="flex items-center justify-between px-5 py-3 text-sm sm:px-6">
                  <span className="text-slate-800">{a.name}</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {a.roomsCleaned} <span className="font-normal text-slate-600">room{a.roomsCleaned === 1 ? "" : "s"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </HmsCard>
      </HmsPage>
    </HMSLayout>
  );
}
