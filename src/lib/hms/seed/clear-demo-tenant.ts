import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_GUEST_ID_PREFIX, DEMO_ORDER_PREFIX } from "./demo-markers";
import { clearTenantOperationalData } from "./clear-tenant-operational";

/** Wipes all operational rows for the tenant (guests, stays, F&B, folio, room status reset). */
export async function clearDemoTenantData(supabase: SupabaseClient, tenantId: string) {
  const result = await clearTenantOperationalData(supabase, tenantId);
  if (!result.ok) throw new Error(result.error);
}

export async function tenantHasDemoData(supabase: SupabaseClient, tenantId: string) {
  const h = () => supabase.schema("hotel");
  const { count } = await h()
    .from("fb_orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .like("order_number", `${DEMO_ORDER_PREFIX}%`);
  return (count ?? 0) > 0;
}

export async function tenantHasNonDemoOperationalData(supabase: SupabaseClient, tenantId: string) {
  const h = () => supabase.schema("hotel");

  const [{ count: guestCount }, { count: orderCount }] = await Promise.all([
    h()
      .from("guests")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .not("id_number", "like", `${DEMO_GUEST_ID_PREFIX}%`),
    h()
      .from("fb_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .not("order_number", "like", `${DEMO_ORDER_PREFIX}%`),
  ]);

  return (guestCount ?? 0) > 0 || (orderCount ?? 0) > 0;
}
