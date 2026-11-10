import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { RotaClient } from "@/components/hms/hr/RotaClient";
import { SwapRequestsCard } from "@/components/hms/hr/SwapRequestsCard";
import { listSwaps } from "@/lib/hms/hr/hr-swaps";
import { HrSubNav } from "@/components/hms/hr/hr-ui";
import { listEmployees, listPayProfiles } from "@/lib/hms/hr/hr-employees";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { dayTotals, hourlyCost, listShifts, listTemplates, weekWarnings } from "@/lib/hms/hr/hr-rota";
import { getHrSettings } from "@/lib/hms/hr/hr-settings";
import { addDays, isoToLocalDate, shiftHours, weekDates, weekStart } from "@/lib/hms/hr/hr-shared";

export default async function HrRotaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string; dept?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await loadHrPage(slug);
  if (!ctx) notFound();
  const settings = await getHrSettings(ctx.service, ctx.tenantId);
  const today = isoToLocalDate(new Date().toISOString());
  const anchor = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today;
  const start = weekStart(anchor, settings.weekStartsOn);
  const end = addDays(start, 6);
  const dept = sp.dept && settings.departments.includes(sp.dept) ? sp.dept : null;

  const allEmployees = await listEmployees(ctx.service, ctx.tenantId);
  const names = new Map(allEmployees.map((e) => [e.id, e.fullName]));
  const [shifts, templates, pay, swaps] = await Promise.all([
    listShifts(ctx.service, ctx.tenantId, start, end, { department: dept, names }),
    listTemplates(ctx.service, ctx.tenantId),
    // Pay comes through the user's own token; empty for anyone who may not see it.
    ctx.canSeePrivate ? listPayProfiles(ctx.privateDb, ctx.tenantId) : Promise.resolve(new Map()),
    listSwaps(ctx.service, ctx.tenantId, { statuses: ["pending", "accepted"] }),
  ]);
  const warnings = await weekWarnings(ctx.service, ctx.tenantId, shifts, allEmployees, start, end);
  const byId = new Map(allEmployees.map((e) => [e.id, e]));
  const costOf = ctx.canSeePrivate
    ? (s: { employeeId: string | null; startsAt: string; endsAt: string; breakMinutes: number }) =>
        s.employeeId ? hourlyCost(pay.get(s.employeeId), byId.get(s.employeeId)?.contractedHoursWeek ?? null) * shiftHours(s) : 0
    : null;
  const dates = weekDates(start);
  const employees = allEmployees.filter((e) => e.status !== "left" && (!dept || e.department === dept || shifts.some((s) => s.employeeId === e.id)));

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <HmsPage wide>
        <HmsPageHeader eyebrow="HR" meaning="team" title="Rota" description="Plan the week, check it, then publish it to your team." />
        <HrSubNav slug={slug} />
        <SwapRequestsCard slug={slug} swaps={swaps} />
        <RotaClient
          slug={slug}
          start={start}
          dates={dates}
          today={today}
          department={dept}
          departments={settings.departments}
          employees={employees}
          shifts={shifts}
          warnings={warnings}
          templates={templates.filter((t) => t.active)}
          totals={dayTotals(shifts, dates, costOf)}
          personHours={Object.fromEntries(employees.map((e) => [e.id, Math.round(shifts.filter((s) => s.employeeId === e.id).reduce((t, s) => t + shiftHours(s), 0) * 10) / 10]))}
          showCost={ctx.canSeePrivate}
        />
      </HmsPage>
    </HMSLayout>
  );
}
