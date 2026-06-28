import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getFrontDeskBoardData } from "@/lib/hms/front-desk-board";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { getRoomsCapabilities, type RoomsRoleCapabilities } from "@/lib/hms/rooms-rbac";
import { getRoomsWorkbenchData, type RoomsWorkbenchPayload } from "@/lib/hms/rooms-workbench";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RoomsWorkbenchPageModel = {
  slug: string;
  tenantId: string;
  initial: RoomsWorkbenchPayload;
  capabilities: RoomsRoleCapabilities;
};

/**
 * Shared server payload for the operational rooms workbench (Front Desk rooms UI),
 * used from both `/hms/[slug]/frontdesk/rooms` and `/hms/[slug]/rooms`.
 */
export async function loadRoomsWorkbenchPageModel(slug: string): Promise<RoomsWorkbenchPageModel> {
  const tenant = await getHotelTenantBySlug(slug);
  const pricing = normalizePricingSetup(tenant?.pricing_setup);
  const roomTypes = normalizeRoomTypes(tenant?.room_types);

  const emptyBoard = await getFrontDeskBoardData({
    tenantId: null,
    floorPlanRaw: null,
    roomTypes: [],
    currency: pricing.currency,
  });

  let initial: RoomsWorkbenchPayload = {
    board: emptyBoard,
    summary: {
      totalRooms: 0,
      availableRooms: 0,
      occupiedRooms: 0,
      reservedRooms: 0,
      dirtyRooms: 0,
      maintenanceRooms: 0,
      outOfServiceRooms: 0,
      priorityCleaning: 0,
      overdueCheckout: 0,
    },
    currency: pricing.currency,
  };

  let capabilities = getRoomsCapabilities("Front Desk");
  let tenantId = tenant?.id ?? "";

  if (tenant?.id) {
    initial = await getRoomsWorkbenchData({
      tenantId: tenant.id,
      slug,
      currency: pricing.currency,
      floorPlanRaw: tenant.floor_plan,
      roomTypes,
    });

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
        capabilities = getRoomsCapabilities(membership.role);
      }
    }
  }

  return { slug, tenantId, initial, capabilities };
}
