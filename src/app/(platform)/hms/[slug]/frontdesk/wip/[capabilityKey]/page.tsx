import Link from "next/link";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsEmptyState, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { getFrontDeskCapabilityByKey } from "@/lib/hms/frontdesk-capabilities";
import { ArrowLeft } from "lucide-react";

export default async function FrontDeskWipCapabilityPage({
  params,
}: {
  params: Promise<{ slug: string; capabilityKey: string }>;
}) {
  const { slug, capabilityKey } = await params;
  const capability = getFrontDeskCapabilityByKey(capabilityKey);

  if (!capability) {
    notFound();
  }

  const hubHref = `/hms/${slug}/frontdesk`;

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <HmsPage>
        <Link
          href={hubHref}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to the front desk
        </Link>
        <HmsPageHeader eyebrow="Front desk" meaning="rooms" title={capability.title} description={capability.subtitle} />
        <HmsEmptyState
          art="page"
          meaning="rooms"
          title="Coming soon"
          description="This part of the front desk isn't ready yet. Everything you need today is on the front desk home page."
          action={
            <Link href={hubHref} className={`${hmsButton.primary} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}>
              Go to the front desk
            </Link>
          }
        />
      </HmsPage>
    </HMSLayout>
  );
}
