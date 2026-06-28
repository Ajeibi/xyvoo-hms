import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { GuestProfileView } from "@/components/hms/guests/GuestProfileView";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getGuestProfileData } from "@/lib/hms/guest-profile";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

export default async function GuestProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) notFound();

  const currency = normalizePricingSetup(tenant.pricing_setup).currency;
  const profile = await getGuestProfileData({
    tenantId: tenant.id,
    guestId: id,
    currency,
  });
  if (!profile) notFound();

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <GuestProfileView slug={slug} data={profile} />
    </HMSLayout>
  );
}
