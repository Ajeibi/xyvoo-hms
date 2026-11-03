import type { Metadata } from "next";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskStaysClient } from "@/components/hms/frontdesk/stays/FrontDeskStaysClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getInHouseStays } from "@/lib/hms/frontdesk-stays";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

export const metadata: Metadata = {
  title: "Guests staying",
};

export default async function FrontDeskStaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ view?: string }>;
}) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : {};
  const tenant = await getHotelTenantBySlug(slug);
  const currency = normalizePricingSetup(tenant?.pricing_setup).currency;
  const rows = tenant ? await getInHouseStays(tenant.id) : [];

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskStaysClient
        slug={slug}
        currency={currency}
        rows={rows}
        initialView={sp.view === "unpaid" ? "unpaid" : "in-house"}
      />
    </HMSLayout>
  );
}
