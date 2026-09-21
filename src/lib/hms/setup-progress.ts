import type { SupabaseClient } from "@supabase/supabase-js";
import type { HotelTenantBySlugRow } from "@/types/hotel-db";

export type SetupProgressKey =
  | "branding"
  | "floor_plan"
  | "room_pricing"
  | "staff_access"
  | "chart_of_accounts"
  | "payment_gateway"
  | "fb_setup"
  | "inventory_setup";

export type SetupProgress = Record<SetupProgressKey, boolean>;

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Only covers checklist items with a real, checkable backing state — a tenant config value,
 * or at least one row existing in the relevant table. Items that are really just "go review
 * this workflow page" (front desk, reservations, dashboard) have no discrete on/off state and
 * are intentionally left out of this map rather than given a fabricated status.
 */
export async function getSetupProgress(
  service: SupabaseClient,
  tenantId: string,
  tenant: Pick<HotelTenantBySlugRow, "display_name" | "name" | "floor_plan" | "room_types" | "paystack_setup">,
): Promise<SetupProgress> {
  const paystackSetup = (tenant.paystack_setup ?? {}) as { enabled?: boolean };

  const [{ count: membershipCount }, { count: coaCount }, { count: fbCount }, { count: inventoryCount }] =
    await Promise.all([
      service.schema("hotel").from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      service.schema("hotel").from("chart_of_accounts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      service.schema("hotel").from("fb_outlets").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      service
        .schema("hotel")
        .from("inventory_locations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ]);

  return {
    branding: Boolean(tenant.display_name && tenant.display_name.trim() && tenant.display_name !== tenant.name),
    floor_plan: isNonEmptyArray(tenant.floor_plan),
    room_pricing: isNonEmptyArray(tenant.room_types),
    staff_access: (membershipCount ?? 0) > 1,
    chart_of_accounts: (coaCount ?? 0) > 0,
    payment_gateway: Boolean(paystackSetup.enabled),
    fb_setup: (fbCount ?? 0) > 0,
    inventory_setup: (inventoryCount ?? 0) > 0,
  };
}
