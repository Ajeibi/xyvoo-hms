import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskCheckoutClient } from "@/components/hms/frontdesk/checkout/FrontDeskCheckoutClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getCheckoutDueList } from "@/lib/hms/frontdesk-checkout";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

export default async function FrontDeskCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const currency = normalizePricingSetup(tenant?.pricing_setup).currency;
  const rows = tenant ? await getCheckoutDueList(tenant.id) : [];

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskCheckoutClient slug={slug} currency={currency} initialRows={rows} />
    </HMSLayout>
  );
}
