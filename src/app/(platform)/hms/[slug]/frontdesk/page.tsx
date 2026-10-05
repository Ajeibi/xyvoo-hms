import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskAreaView } from "@/components/hms/frontdesk/FrontDeskAreaView";
import { getHotelTenantBySlug, getTenantRoomCount } from "@/lib/hms/data";
import { getFrontDeskBoardData } from "@/lib/hms/front-desk-board";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";

export default async function FrontDeskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const roomCount = tenant ? await getTenantRoomCount(tenant.id) : 0;
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
      <FrontDeskAreaView
        slug={slug}
        area="overview"
        inventoryRoomCount={roomCount}
        boardData={boardData}
      />
    </HMSLayout>
  );
}
