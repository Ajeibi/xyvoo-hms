import HMSLayout from "@/components/hms/HMSLayout";
import { ReservationsListClient } from "@/components/hms/reservations/ReservationsListClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getReservationsList } from "@/lib/hms/reservations-list";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ReservationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const roomTypes = normalizeRoomTypes(tenant?.room_types);
  const pricing = normalizePricingSetup(tenant?.pricing_setup);
  const payload = tenant
    ? await getReservationsList(tenant.id, roomTypes)
    : { rows: [], summary: { total: 0, confirmed: 0, checkedIn: 0, checkedOut: 0, cancelledOrNoShow: 0 } };

  let capabilities = getArrivalsCapabilities("Front Desk");

  if (tenant?.id) {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (user) {
      const service = createServerSupabaseClient();
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
    }
  }

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <ReservationsListClient
        slug={slug}
        currency={pricing.currency}
        initial={payload}
        capabilities={capabilities}
      />
    </HMSLayout>
  );
}
