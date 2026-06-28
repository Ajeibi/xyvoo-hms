import { getRoomUnitCountForTenant } from "@/lib/hms/data";
import { getFloorPlanLevelCount, getFloorPlanRoomTotal, type HotelFloorPlanEntry } from "@/lib/hms/floor-plan";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { HotelTenantBySlugRow } from "@/types/hotel-db";

function countBy<T extends string | number>(rows: { key: T }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { key } of rows) {
    const k = String(key);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Server-side: logs hotel inventory + floor plan snapshot when DEBUG_HMS=1 or NODE_ENV=development,
 * and only for owner/admin. Output appears in the Next.js terminal (not the browser console).
 */
export async function maybeLogHotelDashboardDebug(opts: {
  slug: string;
  isOwnerOrAdmin: boolean;
  tenant: HotelTenantBySlugRow | null;
  floorPlan: HotelFloorPlanEntry[];
  roomTypes: HotelRoomTypeSetup[];
  signupRoomCount: number;
  totalRoomsFromPricing: number;
}): Promise<void> {
  const enabled = process.env.NODE_ENV === "development" || process.env.DEBUG_HMS === "1";
  if (!enabled || !opts.isOwnerOrAdmin || !opts.tenant) return;

  const supabase = createServerSupabaseClient();
  const { data: units, error } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("floor, room_type_code, status")
    .eq("tenant_id", opts.tenant.id);

  if (error) {
    console.warn("[HMS hotel debug] room_units query failed:", error.message);
    return;
  }

  const list = units ?? [];
  const byFloor = countBy(list.map((u) => ({ key: Number(u.floor) })));
  const byType = countBy(list.map((u) => ({ key: String(u.room_type_code ?? "") })));
  const byStatus = countBy(list.map((u) => ({ key: String(u.status ?? "") })));

  let inventoryCount = 0;
  try {
    inventoryCount = await getRoomUnitCountForTenant(opts.tenant.id);
  } catch {
    inventoryCount = list.length;
  }

  const floorPlanTarget = getFloorPlanRoomTotal(opts.floorPlan);
  const floorPlanLevels = getFloorPlanLevelCount(opts.floorPlan);

  const payload = {
    slug: opts.slug,
    tenant: {
      id: opts.tenant.id,
      name: opts.tenant.name,
      display_name: opts.tenant.display_name,
      subdomain: opts.tenant.subdomain,
    },
    signupRoomCount: opts.signupRoomCount,
    totalRoomsFromPricing: opts.totalRoomsFromPricing,
    inventory: {
      room_units_row_count: list.length,
      getRoomUnitCountForTenant: inventoryCount,
      by_floor: byFloor,
      by_room_type_code: byType,
      by_status: byStatus,
    },
    floor_plan: {
      levels: floorPlanLevels,
      target_total_rooms: floorPlanTarget,
      entries: opts.floorPlan,
    },
    room_types: opts.roomTypes,
  };

  console.log("[HMS hotel debug]", JSON.stringify(payload, null, 2));
}
