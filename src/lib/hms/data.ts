import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { HotelProfileRoomCountRow, HotelTenantBySlugRow } from "@/types";

export async function getHotelTenantBySlug(slug: string) {
  const supabase = createServerSupabaseClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      "id, subdomain, name, display_name, logo_url, room_types, pricing_setup, floor_plan, hms_dashboard_tour_hidden, paystack_setup",
    )
    .eq("product", "hotel")
    .or(`subdomain.eq.${slug},name.eq.${slug}`)
    .maybeSingle();

  return (tenant as HotelTenantBySlugRow | null) || null;
}

export async function getTenantRoomCount(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data: profile } = await supabase
    .schema("hotel")
    .from("profiles")
    .select("room_count")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  const roomCount = (profile as HotelProfileRoomCountRow | null)?.room_count;
  return roomCount || 0;
}

export async function listRoomUnitsForTenant(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("id, room_code, floor, room_type_code")
    .eq("tenant_id", tenantId)
    .order("room_code");

  if (error) {
    console.warn("[listRoomUnitsForTenant]", error.message);
    return [];
  }
  return (data ?? []) as Array<{
    id: string;
    room_code: string;
    floor: number;
    room_type_code: string;
  }>;
}

export async function getRoomUnitCountForTenant(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) {
    console.warn("[getRoomUnitCountForTenant]", error.message);
    return 0;
  }
  return count ?? 0;
}
