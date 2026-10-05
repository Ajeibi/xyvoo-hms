import { Suspense } from "react";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskFolioClient } from "@/components/hms/frontdesk/folio/FrontDeskFolioClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

export default async function FrontDeskFolioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const currency = normalizePricingSetup(tenant?.pricing_setup).currency;

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading folio…</p>}>
        <FrontDeskFolioClient slug={slug} currency={currency} />
      </Suspense>
    </HMSLayout>
  );
}
