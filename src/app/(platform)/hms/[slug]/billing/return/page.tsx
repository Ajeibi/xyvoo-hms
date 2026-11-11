import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { BillingReturn } from "@/components/hms/settings/BillingReturn";
import { getHotelRoleAccess } from "@/lib/hms/access";

export const metadata: Metadata = { title: "Payment to XYVOO" };

/** Where Paystack sends a hotel owner or admin back after paying XYVOO. */
export default async function BillingReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const { slug } = await params;
  const { reference, trxref } = await searchParams;
  const access = await getHotelRoleAccess(slug);

  return (
    <HMSLayout slug={slug} requiredSection="settings">
      <HmsPage>
        <HmsPageHeader eyebrow="Settings" title="Payment to XYVOO" />
        {access.isOwnerOrAdmin ? (
          <BillingReturn slug={slug} reference={reference || trxref || ""} />
        ) : (
          <HmsEmptyState icon={ShieldCheck} meaning="team" title="Only an owner or admin can see this" description="Ask your hotel's owner or admin about payments to XYVOO." />
        )}
      </HmsPage>
    </HMSLayout>
  );
}
