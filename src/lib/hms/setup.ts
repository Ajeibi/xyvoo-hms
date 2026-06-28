import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug, getRoomUnitCountForTenant, getTenantRoomCount } from "@/lib/hms/data";
import {
  getFloorPlanEffectiveTarget,
  getFloorPlanRoomTotal,
  getFloorPlanTargetRoomCount,
  isFloorPlanComplete,
  normalizeFloorPlan,
} from "@/lib/hms/floor-plan";
import {
  getRoomPricingSummary,
  isRoomPricingSetupComplete,
  normalizeRoomTypes,
} from "@/lib/hms/room-pricing";
import { getPaystackConfig, isPaystackReady } from "@/lib/paystack/config";

const ADMIN_LIKE_ROLES = new Set(["owner", "admin"]);

export type HMSSetupTask = {
  id: "branding" | "floor-plan" | "room-pricing" | "department-access" | "paystack";
  title: string;
  description: string;
  complete: boolean;
  href: string;
};

export type HMSDashboardSetupSummary = {
  showModal: boolean;
  isOwnerOrAdmin: boolean;
  isComplete: boolean;
  tasks: HMSSetupTask[];
};

export async function getDashboardSetupSummary(slug: string): Promise<HMSDashboardSetupSummary> {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) {
    return {
      showModal: false,
      isOwnerOrAdmin: false,
      isComplete: true,
      tasks: [],
    };
  }

  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) {
    return {
      showModal: false,
      isOwnerOrAdmin: false,
      isComplete: true,
      tasks: [],
    };
  }

  const service = createServerSupabaseClient();
  const { data: membership } = await service
    .schema("hotel")
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isOwnerOrAdmin = Boolean(membership && ADMIN_LIKE_ROLES.has(membership.role));
  if (!isOwnerOrAdmin) {
    return {
      showModal: false,
      isOwnerOrAdmin: false,
      isComplete: true,
      tasks: [],
    };
  }

  const { count: departmentLoginCount } = await service
    .schema("hotel")
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .neq("user_id", user.id)
    .in("role", ["admin", "staff"]);

  const brandingComplete = Boolean(tenant.display_name?.trim() || tenant.logo_url?.trim());
  const signupRoomCount = await getTenantRoomCount(tenant.id);
  const floorPlan = normalizeFloorPlan(tenant.floor_plan);
  const roomTypes = normalizeRoomTypes(tenant.room_types);
  const configuredRoomTotal = roomTypes.reduce((sum, rt) => sum + rt.rooms, 0);
  const catalogFloorTarget = getFloorPlanTargetRoomCount(signupRoomCount, configuredRoomTotal);
  const roomUnitCount = await getRoomUnitCountForTenant(tenant.id);
  const floorTarget = getFloorPlanEffectiveTarget(catalogFloorTarget, roomUnitCount);
  const floorPlanComplete = isFloorPlanComplete(floorPlan, floorTarget);
  const roomPricingSummary = getRoomPricingSummary(roomTypes, signupRoomCount);
  const roomPricingComplete = isRoomPricingSetupComplete(roomTypes, signupRoomCount);
  const departmentAccessComplete = (departmentLoginCount || 0) > 0;
  const paystackComplete = isPaystackReady(getPaystackConfig(tenant));

  const tasks: HMSSetupTask[] = [
    {
      id: "branding",
      title: "Review hotel branding",
      description: "Set a dashboard name and upload a logo so the property is clearly branded for your team.",
      complete: brandingComplete,
      href: `/hms/${slug}/settings`,
    },
    {
      id: "floor-plan",
      title: "Allocate rooms by floor",
      description:
        floorTarget <= 0
          ? "Add room types with inventory counts (or complete registration with a room total) so floors can be mapped when you need them."
          : floorPlanComplete && floorPlan.length === 0
            ? `All ${floorTarget} room(s) use the default ground floor. Optional: split across floors in Settings.`
            : floorPlanComplete
              ? `All ${floorTarget} rooms are mapped across ${floorPlan.length} floor(s).`
              : `You have ${floorTarget} room${floorTarget === 1 ? "" : "s"} to place. ${getFloorPlanRoomTotal(floorPlan)} are assigned across floors — match the total in Settings, or clear rows to use ground floor only.`,
      complete: floorPlanComplete,
      href: `/hms/${slug}/settings#floor-plan-setup`,
    },
    {
      id: "room-pricing",
      title: "Configure room types and prices",
      description:
        roomPricingSummary.remainingRooms > 0
          ? `${roomPricingSummary.configuredRooms} of ${roomPricingSummary.totalRooms} rooms are assigned to priced room types. Finish the remaining rooms so the setup is complete.`
          : "Set the room categories you sell, their inventory counts, and the default pricing rules used across the property.",
      complete: roomPricingComplete,
      href: `/hms/${slug}/settings#rooms-pricing-setup`,
    },
    {
      id: "department-access",
      title: "Create department logins",
      description: "Set up role-based access for departments like Front Desk, Housekeeping, Accounts, and F&B.",
      complete: departmentAccessComplete,
      href: `/hms/${slug}/settings`,
    },
    {
      id: "paystack",
      title: "Connect Paystack for card payments",
      description: "Add your hotel's Paystack keys so front desk can charge guest folios by card.",
      complete: paystackComplete,
      href: `/hms/${slug}/settings#paystack-setup`,
    },
  ];

  const isComplete = tasks.every((task) => task.complete);

  return {
    showModal: !isComplete,
    isOwnerOrAdmin,
    isComplete,
    tasks,
  };
}
