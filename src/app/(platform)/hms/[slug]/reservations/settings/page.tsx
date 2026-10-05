import HMSLayout from "@/components/hms/HMSLayout";
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
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Reservations settings</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
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
