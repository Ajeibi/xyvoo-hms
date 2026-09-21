import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { GuestProfileView } from "@/components/hms/guests/GuestProfileView";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getGuestProfileData } from "@/lib/hms/guest-profile";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";

export default async function GuestProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  if (!tenant) notFound();

  const currency = normalizePricingSetup(tenant.pricing_setup).currency;
  const profile = await getGuestProfileData({
    tenantId: tenant.id,
    guestId: id,
    currency,
  });
  if (!profile) notFound();

  const canEdit = getArrivalsCapabilities(access.role ?? "Front Desk").canEditNotes;

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <GuestProfileView slug={slug} data={profile} canEdit={canEdit} />
    </HMSLayout>
  );
}
