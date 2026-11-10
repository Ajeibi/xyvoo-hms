import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { TimeClient } from "@/components/hms/hr/TimeClient";
import { HrSubNav } from "@/components/hms/hr/hr-ui";
import { listEmployees } from "@/lib/hms/hr/hr-employees";
import { signHrFiles } from "@/lib/hms/hr/hr-files";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { getHrSettings } from "@/lib/hms/hr/hr-settings";
import { addDays, isoToLocalDate, weekStart } from "@/lib/hms/hr/hr-shared";
import { liveAttendance, timesheet } from "@/lib/hms/hr/hr-time";

export default async function HrTimePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ week?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await loadHrPage(slug);
  if (!ctx) notFound();
  const settings = await getHrSettings(ctx.service, ctx.tenantId);
  const today = isoToLocalDate(new Date().toISOString());
  const start = weekStart(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today, settings.weekStartsOn);
  const end = addDays(start, 6);
  const employees = await listEmployees(ctx.service, ctx.tenantId);
  const [rawRows, live] = await Promise.all([timesheet(ctx.service, ctx.tenantId, start, end, employees), liveAttendance(ctx.service, ctx.tenantId, employees)]);
  // Clock screen photos go to the browser only as links that expire in 10 minutes.
  const urls = await signHrFiles(
    ctx.service,
    ctx.tenantId,
    rawRows.flatMap((r) => r.entries.flatMap((e) => [e.clockInPhoto, e.clockOutPhoto])),
  );
  const rows = rawRows.map((r) => ({
    ...r,
    entries: r.entries.map((e) => ({
      ...e,
      clockInPhoto: e.clockInPhoto ? (urls.get(e.clockInPhoto) ?? null) : null,
      clockOutPhoto: e.clockOutPhoto ? (urls.get(e.clockOutPhoto) ?? null) : null,
    })),
  }));

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <HmsPage wide>
        <HmsPageHeader eyebrow="HR" meaning="team" title="Time and attendance" description="Who is in, who is late, and the hours to approve for payroll." />
        <HrSubNav slug={slug} />
        <TimeClient
          slug={slug}
          start={start}
          end={end}
          today={today}
          rows={rows}
          live={live}
          employees={employees.filter((e) => e.status !== "left").map((e) => ({ id: e.id, name: e.fullName }))}
          overtimeAfter={settings.overtimeAfterWeeklyHours}
          kioskReady={settings.kioskEnabled && settings.hasKioskLink}
          photosOn={settings.kioskPhoto}
        />
      </HmsPage>
    </HMSLayout>
  );
}
