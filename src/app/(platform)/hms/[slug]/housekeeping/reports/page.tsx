import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHousekeepingDailyReport } from "@/lib/hms/housekeeping-reports";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";

export default async function HousekeepingReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="housekeeping-reports">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const report = await getHousekeepingDailyReport(service, tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping-reports">
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-0.5 text-sm text-slate-500">Today&apos;s housekeeping activity, updated as tasks move.</p>

        <HousekeepingSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">Tasks today</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{report.tasksCreatedToday}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">Rooms ready</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{report.tasksCompletedToday}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">Avg. clean time</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {report.averageCleanMinutes != null ? `${report.averageCleanMinutes}m` : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">First-pass inspection rate</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {report.inspectionPassRate != null ? `${report.inspectionPassRate}%` : "—"}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">Rooms cleaned per attendant (today)</h2>
          {report.perAttendant.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No completed rooms yet today.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {report.perAttendant.map((a) => (
                <div key={a.name} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{a.name}</span>
                  <span className="font-medium text-slate-900">{a.roomsCleaned}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </HMSLayout>
  );
}
