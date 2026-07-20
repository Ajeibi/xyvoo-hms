import HMSLayout from "@/components/hms/HMSLayout";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";
import { listHousekeepingEligibleItems, listRoomTypePars } from "@/lib/hms/housekeeping-inventory";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { HousekeepingSettingsClient } from "@/components/hms/housekeeping/HousekeepingSettingsClient";
import { HousekeepingRoomTypeParsClient } from "@/components/hms/housekeeping/HousekeepingRoomTypeParsClient";

export default async function HousekeepingSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="housekeeping-settings">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Housekeeping Settings</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const [settings, eligibleItems, pars] = await Promise.all([
    getTenantHousekeepingSettings(service, tenant.id),
    listHousekeepingEligibleItems(service, tenant.id),
    listRoomTypePars(service, tenant.id),
  ]);
  const roomTypes = normalizeRoomTypes(tenant.room_types).map((rt) => ({ code: rt.id, name: rt.name }));

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping-settings">
      <HousekeepingSettingsClient slug={slug} initialSettings={settings} />
      <HousekeepingRoomTypeParsClient
        slug={slug}
        roomTypes={roomTypes}
        eligibleItems={eligibleItems}
        initialPars={pars}
      />
    </HMSLayout>
  );
}
