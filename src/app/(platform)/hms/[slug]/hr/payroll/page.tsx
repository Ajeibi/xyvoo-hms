import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { PayRunsClient } from "@/components/hms/hr/PayrollClient";
import { HrSubNav, PrivateLocked } from "@/components/hms/hr/hr-ui";
import { listPayRuns } from "@/lib/hms/hr/hr-payroll";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { addDays, isoToLocalDate } from "@/lib/hms/hr/hr-shared";

export default async function HrPayrollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadHrPage(slug);
  if (!ctx) notFound();
  const today = isoToLocalDate(new Date().toISOString());
  const start = `${today.slice(0, 7)}-01`;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = addDays(next.toISOString().slice(0, 10), -1);

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <HmsPage wide>
        <HmsPageHeader eyebrow="HR" meaning="team" title="Payroll" description="Monthly pay with PAYE, pension, NHF and NSITF worked out, ready for the bank and the books." />
        <HrSubNav slug={slug} />
        {ctx.canSeePrivate ? (
          <PayRunsClient slug={slug} runs={await listPayRuns(ctx.privateDb, ctx.tenantId)} defaultStart={start} defaultEnd={end} />
        ) : (
          <HmsCard>
            <PrivateLocked what="payroll" />
          </HmsCard>
        )}
      </HmsPage>
    </HMSLayout>
  );
}
