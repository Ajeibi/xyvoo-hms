import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { LeaveClient } from "@/components/hms/hr/LeaveClient";
import { HrSubNav } from "@/components/hms/hr/hr-ui";
import { listEmployees } from "@/lib/hms/hr/hr-employees";
import { awayByDay, leaveBalances, listLeave, shiftsDuringLeave } from "@/lib/hms/hr/hr-leave";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { listLeaveTypes } from "@/lib/hms/hr/hr-settings";
import { addDays, isoToLocalDate } from "@/lib/hms/hr/hr-shared";

export default async function HrLeavePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ month?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await loadHrPage(slug);
  if (!ctx) notFound();
  const today = isoToLocalDate(new Date().toISOString());
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const from = `${month}-01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const to = addDays(next.toISOString().slice(0, 10), -1);
  const year = Number(month.slice(0, 4));

  const employees = (await listEmployees(ctx.service, ctx.tenantId)).filter((e) => e.status !== "left");
  const [types, pending, monthLeave, balances] = await Promise.all([
    listLeaveTypes(ctx.service, ctx.tenantId),
    listLeave(ctx.service, ctx.tenantId, { statuses: ["pending"] }),
    listLeave(ctx.service, ctx.tenantId, { from, to, statuses: ["pending", "approved"] }),
    leaveBalances(ctx.service, ctx.tenantId, employees, year),
  ]);
  const clashes = Object.fromEntries(
    await Promise.all(pending.map(async (l) => [l.id, (await shiftsDuringLeave(ctx.service, ctx.tenantId, l.employeeId, l.startDate, l.endDate)).length] as const)),
  );

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <HmsPage wide>
        <HmsPageHeader eyebrow="HR" meaning="team" title="Leave" description="Requests to decide, who is away, and what everyone has left." />
        <HrSubNav slug={slug} />
        <LeaveClient
          slug={slug}
          month={month}
          year={year}
          today={today}
          types={types}
          pending={pending}
          clashes={clashes}
          calendar={awayByDay(monthLeave, from, to)}
          upcoming={monthLeave.filter((l) => l.status === "approved")}
          employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
          balances={Object.fromEntries(balances)}
        />
      </HmsPage>
    </HMSLayout>
  );
}
