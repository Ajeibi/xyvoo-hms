import {
  AttentionCenterCard,
  FinancialPerformanceSection,
  FloorStatusCard,
  FoodBeverageCard,
  InventoryWatchCard,
  KitchenCard,
  OccupancyStatisticsCard,
  ReservationsFrontDeskCard,
  RoomStatusCard,
} from "@/components/hms/dashboard/analytics";
import { BedDouble, CalendarDays, ChartNoAxesColumn, Users } from "lucide-react";
import HMSOverviewCards from "@/components/hms/dashboard/HMSOverviewCards";
import HMSPricingRulesCard from "@/components/hms/dashboard/HMSPricingRulesCard";
import HMSQuickLinks from "@/components/hms/dashboard/HMSQuickLinks";
import HMSRoomsPricingCard from "@/components/hms/dashboard/HMSRoomsPricingCard";
import HMSSetupModal from "@/components/hms/HMSSetupModal";
import HMSTour from "@/components/hms/HMSTour";
import HMSLayout from "@/components/hms/HMSLayout";
import { getHotelTenantBySlug, getTenantRoomCount } from "@/lib/hms/data";
import { getTenantFbSettings } from "@/lib/hms/fb-settings";
import { maybeLogHotelDashboardDebug } from "@/lib/hms/hotel-debug-snapshot";
import { getFloorPlanLevelCount, normalizeFloorPlan } from "@/lib/hms/floor-plan";
import { getHotelDashboardMetrics } from "@/lib/hms/dashboard-metrics";
import {
  formatPricingAmount,
  getRoomPricingSummary,
  normalizePricingSetup,
  normalizeRoomTypes,
} from "@/lib/hms/room-pricing";
import { getDashboardSetupSummary } from "@/lib/hms/setup";
import { getDashboardTourStatus } from "@/lib/hms/tour";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function HMSDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const signupRoomCount = tenant ? await getTenantRoomCount(tenant.id) : 0;
  const roomTypes = normalizeRoomTypes(tenant?.room_types);
  const pricingSetup = normalizePricingSetup(tenant?.pricing_setup);
  const roomPricingSummary = getRoomPricingSummary(roomTypes, signupRoomCount);
  const floorPlan = normalizeFloorPlan(tenant?.floor_plan);
  const totalFloors = getFloorPlanLevelCount(floorPlan);
  const dashboardTourStatus = await getDashboardTourStatus(slug);
  const setupSummary = await getDashboardSetupSummary(slug);
  const fbSettings =
    tenant && setupSummary.isOwnerOrAdmin
      ? await getTenantFbSettings(createServerSupabaseClient(), tenant.id)
      : null;
  const kitchenTimingSetupHref =
    setupSummary.isOwnerOrAdmin && fbSettings && !fbSettings.kitchenOverdueMinutesConfigured
      ? `/hms/${slug}/kitchen/settings`
      : null;
  await maybeLogHotelDashboardDebug({
    slug,
    isOwnerOrAdmin: setupSummary.isOwnerOrAdmin,
    tenant,
    floorPlan,
    roomTypes,
    signupRoomCount,
    totalRoomsFromPricing: roomPricingSummary.totalRooms,
  });
  const hotelName = tenant?.display_name?.trim() || tenant?.name?.trim() || slug;
  const rateBand =
    roomPricingSummary.lowestRate !== null
      ? `${formatPricingAmount(roomPricingSummary.lowestRate, pricingSetup.currency)} - ${formatPricingAmount(roomPricingSummary.highestRate, pricingSetup.currency)}`
      : "Not configured";
  const averageRate =
    roomPricingSummary.lowestRate !== null && roomPricingSummary.highestRate !== null
      ? Math.round((roomPricingSummary.lowestRate + roomPricingSummary.highestRate) / 2)
      : null;

  const { model: analyticsModel, reservationRecordCount, inHouseGuestHeadcount } =
    await getHotelDashboardMetrics({
      tenantId: tenant?.id ?? null,
      totalRoomsFromPricing: roomPricingSummary.totalRooms,
      averageRateFromPricing: averageRate,
      currency: pricingSetup.currency,
    });

  return (
    <HMSLayout slug={slug} requiredSection="dashboard">
      <HMSTour slug={slug} initialStatus={dashboardTourStatus} />
      <HMSSetupModal
        slug={slug}
        initialTourStatus={dashboardTourStatus}
        showModal={setupSummary.showModal}
        tasks={setupSummary.tasks}
      />
      <div className="mx-auto w-full max-w-[1500px] px-6 py-8 sm:px-8">
        <HMSOverviewCards
          hotelName={hotelName}
          actionHref={`/hms/${slug}/settings#rooms-pricing-setup`}
          summaryItems={[
            {
              icon: BedDouble,
              label: "Total rooms",
              value: String(roomPricingSummary.totalRooms),
              description: "Registered inventory currently on file.",
            },
            {
              icon: ChartNoAxesColumn,
              label: "Rate band",
              value: rateBand,
              description: "Current sell range from your pricing setup.",
            },
          ]}
          metrics={[
            {
              icon: CalendarDays,
              label: "Reservations",
              value: String(reservationRecordCount),
              description: "Total reservations on file for this property.",
            },
            {
              icon: Users,
              label: "Guests",
              value: String(inHouseGuestHeadcount),
              description: "Headcount on in-house stays (adults + children from active reservations).",
            },
          ]}
        />

        <div className="mt-6 space-y-4">
          <FinancialPerformanceSection
            currency={pricingSetup.currency}
            financialTrendViews={analyticsModel.financialTrendViews}
            occupancyRateToday={analyticsModel.financialBase.occupancyRate}
          />

          <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ReservationsFrontDeskCard items={analyticsModel.movementItems} />
            <OccupancyStatisticsCard trend={analyticsModel.occupancyTrend} />
          </div>

          <div className="space-y-4">
            <HMSRoomsPricingCard
              slug={slug}
              roomTypes={roomTypes}
              currency={pricingSetup.currency}
              summary={roomPricingSummary}
              totalFloors={totalFloors}
            />
            <HMSPricingRulesCard pricingSetup={pricingSetup} summary={roomPricingSummary} />
          </div>

          <div className="grid items-stretch gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <RoomStatusCard items={analyticsModel.roomStatusItems} />
            <FloorStatusCard items={analyticsModel.floorStatusItems} />
          </div>

          <div className="grid items-stretch gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <FoodBeverageCard
              items={analyticsModel.foodAndBeverageItems}
              outletBreakdownItems={analyticsModel.outletBreakdownItems}
            />
            <KitchenCard
              items={analyticsModel.kitchenItems}
              alertItems={analyticsModel.kitchenAlertItems}
              setupHref={kitchenTimingSetupHref}
            />
          </div>

          <div className="grid items-stretch gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <InventoryWatchCard
              summary={analyticsModel.inventorySummary}
              lowStockItems={analyticsModel.lowStockItems}
            />
            <AttentionCenterCard alerts={analyticsModel.operationalAlerts} />
          </div>
        </div>

        <HMSQuickLinks slug={slug} />
      </div>
    </HMSLayout>
  );
}
