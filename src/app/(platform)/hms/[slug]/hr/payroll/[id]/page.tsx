import Link from "next/link";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { PayRunClient } from "@/components/hms/hr/PayrollClient";
import { HrSubNav, PrivateLocked } from "@/components/hms/hr/hr-ui";
import { getPayRun } from "@/lib/hms/hr/hr-payroll";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { isoToLocalDate } from "@/lib/hms/hr/hr-shared";

export default async function HrPayRunPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await loadHrPage(slug);
  if (!ctx) notFound();
  const found = ctx.canSeePrivate ? await getPayRun(ctx.privateDb, ctx.tenantId, id) : null;
  if (ctx.canSeePrivate && !found) notFound();

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <HmsPage wide>
        <HmsPageHeader
          eyebrow="HR · Payroll"
          meaning="team"
          title={found ? `Pay run: ${found.run.label}` : "Pay run"}
          description={found ? `${found.run.periodStart} to ${found.run.periodEnd}` : undefined}
          actions={
            <Link href={`/hms/${slug}/hr/payroll`} className={hmsButton.secondary}>
              All pay runs
            </Link>
          }
        />
        <HrSubNav slug={slug} />
        {found ? (
          <PayRunClient slug={slug} run={found.run} slips={found.slips} today={isoToLocalDate(new Date().toISOString())} />
        ) : (
          <HmsCard>
            <PrivateLocked what="payroll" />
          </HmsCard>
        )}
      </HmsPage>
    </HMSLayout>
  );
}
