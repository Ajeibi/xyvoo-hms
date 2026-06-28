import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskReservationCalendar } from "@/components/hms/frontdesk/FrontDeskReservationCalendar";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getFrontDeskBoardData } from "@/lib/hms/front-desk-board";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";

export default async function FrontDeskCalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const roomTypes = normalizeRoomTypes(tenant?.room_types);
  const pricingSetup = normalizePricingSetup(tenant?.pricing_setup);
  const boardData = await getFrontDeskBoardData({
    tenantId: tenant?.id ?? null,
    floorPlanRaw: tenant?.floor_plan,
    roomTypes,
    currency: pricingSetup.currency,
  });

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskReservationCalendar slug={slug} data={boardData} />
    </HMSLayout>
  );
}
