import HMSLayout from "@/components/hms/HMSLayout";
import { HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getTenantFolioSettings } from "@/lib/hms/folio";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ReservationsSettingsClient } from "@/components/hms/reservations/ReservationsSettingsClient";

export default async function ReservationsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="reservations-settings">
        <HmsPage>
          <HmsPageHeader eyebrow="Reservations" meaning="rooms" title="Reservation settings" />
          <HmsEmptyState art="page" meaning="rooms" title="We couldn't find this hotel" description="Check the web address, or go back to your dashboard and try again." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const settings = await getTenantFolioSettings(createServerSupabaseClient(), tenant.id);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  return (
    <HMSLayout slug={slug} requiredSection="reservations-settings">
      <ReservationsSettingsClient
        slug={slug}
        currency={currency}
        initial={settings}
        canManage={isAdminLikeRole(access.role)}
      />
    </HMSLayout>
  );
}
