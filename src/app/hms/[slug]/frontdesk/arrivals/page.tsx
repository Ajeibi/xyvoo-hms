import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskArrivalsClient } from "@/components/hms/frontdesk/arrivals/FrontDeskArrivalsClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getArrivalsWorkbenchData, type ArrivalsWorkbenchPayload } from "@/lib/hms/arrivals-workbench";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { fetchCheckInStaffOptions, checkInStaffOptionsForSessionUser } from "@/lib/hms/check-in-staff-options";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function FrontDeskArrivalsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const currency = normalizePricingSetup(tenant?.pricing_setup).currency;

  let initial: ArrivalsWorkbenchPayload = {
    rows: [],
    summary: {
      totalArrivals: 0,
      checkedIn: 0,
      pending: 0,
      vip: 0,
      noShows: 0,
      roomsReady: 0,
    },
    currency,
    rangeLabel: "Today",
    startIso: "",
    endIso: "",
  };

  let capabilities = getArrivalsCapabilities("Front Desk");
  let tenantId = tenant?.id ?? "";
  let checkInStaffOptions: Awaited<ReturnType<typeof fetchCheckInStaffOptions>> = [];
  let defaultCheckedInByUserId: string | null = null;

  if (tenant?.id) {
    initial = await getArrivalsWorkbenchData({
      tenantId: tenant.id,
      currency,
      preset: "today",
    });

    const service = createServerSupabaseClient();
    checkInStaffOptions = await fetchCheckInStaffOptions(service, tenant.id);

    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (user) {
      checkInStaffOptions = checkInStaffOptionsForSessionUser(checkInStaffOptions, user.id);
      if (checkInStaffOptions.length > 0) {
        defaultCheckedInByUserId = user.id;
      }
      const { data: membership } = await service
        .schema("hotel")
        .from("memberships")
        .select("role")
        .eq("tenant_id", tenant.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membership?.role) {
        capabilities = getArrivalsCapabilities(membership.role);
      }
    } else {
      checkInStaffOptions = [];
    }
  }

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskArrivalsClient
        slug={slug}
        currency={currency}
        tenantId={tenantId}
        initial={initial}
        capabilities={capabilities}
        checkInStaffOptions={checkInStaffOptions}
        defaultCheckedInByUserId={defaultCheckedInByUserId}
      />
    </HMSLayout>
  );
}
