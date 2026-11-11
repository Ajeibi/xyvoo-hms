import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { GuestProfileView } from "@/components/hms/guests/GuestProfileView";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getGuestProfileData } from "@/lib/hms/guest-profile";
import { listCompanyOptions, loadGuestPageContext } from "@/lib/hms/guest-page";
import { getGuestConsent } from "@/lib/hms/guest-consent";
import { signUnsubscribeToken } from "@/lib/hms/guest-consent";
import { getGuestLoyalty, getLoyaltySettings } from "@/lib/hms/guest-loyalty";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { KnownInGroupPanel } from "@/components/hms/groups/KnownInGroupPanel";

export default async function GuestProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await loadGuestPageContext(slug);
  if (!ctx) notFound();

  const service = createServerSupabaseClient();
  const profile = await getGuestProfileData({ tenantId: ctx.tenant.id, guestId: id, currency: ctx.currency });
  if (!profile) notFound();

  const [companies, consent, loyaltySettings] = await Promise.all([
    listCompanyOptions(ctx.tenant.id),
    getGuestConsent(service, ctx.tenant.id, id),
    getLoyaltySettings(service, ctx.tenant.id),
  ]);
  const loyalty = await getGuestLoyalty(service, ctx.tenant.id, id, loyaltySettings);

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <GuestProfileView
        slug={slug}
        data={profile}
        canEdit={ctx.canEdit}
        canManage={ctx.canManage}
        companies={companies}
        consent={consent}
        unsubscribeUrl={`/unsubscribe/${signUnsubscribeToken(ctx.tenant.id, id)}`}
        loyaltySettings={loyaltySettings}
        loyalty={loyalty}
        pointValueLabel={formatPricingAmount(loyaltySettings.pointValue, ctx.currency)}
      />
      {/* Hotel groups: the same guest at the group's other hotels (nothing for a hotel on its own). */}
      <KnownInGroupPanel slug={slug} tenantId={ctx.tenant.id} guestId={id} currency={ctx.currency} canEdit={ctx.canEdit} />
    </HMSLayout>
  );
}
