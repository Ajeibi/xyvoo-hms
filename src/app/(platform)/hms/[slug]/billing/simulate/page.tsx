import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { BillingSimulate } from "@/components/hms/settings/BillingSimulate";
import { simulatedPaymentsEnabled } from "@/lib/payments/simulated";

export const metadata: Metadata = { title: "Pretend payment", robots: { index: false } };

/** The pretend Paystack page. Not found anywhere simulating is off (every deployed site). */
export default async function BillingSimulatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string }>;
}) {
  if (!simulatedPaymentsEnabled()) notFound();
  const { slug } = await params;
  const { reference } = await searchParams;
  if (!reference) notFound();

  return (
    <HMSLayout slug={slug} requiredSection="settings">
      <HmsPage>
        <HmsPageHeader eyebrow="Settings" title="Pay XYVOO" />
        <BillingSimulate slug={slug} reference={reference} />
      </HmsPage>
    </HMSLayout>
  );
}
