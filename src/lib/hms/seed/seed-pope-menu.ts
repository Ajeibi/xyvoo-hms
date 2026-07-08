import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPopeMenuPayload } from "./pope-menu-catalog";

/** Remove F&B catalog only — keeps fb_orders / fb_order_items. */
export async function clearTenantFbCatalog(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const h = () => supabase.schema("hotel");

  for (const table of ["fb_menu_items", "fb_tables", "fb_menu_categories", "fb_stations", "fb_outlets"] as const) {
    const { error } = await h().from(table).delete().eq("tenant_id", tenantId);
    if (error) return { ok: false, error: `${table}: ${error.message}` };
  }

  return { ok: true };
}

async function upsertBatch(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await supabase.schema("hotel").from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
}

export type SeedPopeMenuResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** Load Pope JPII menu: Menu 1 (bar) + Menu 2 (restaurant). */
export async function seedPopeMenu(
  supabase: SupabaseClient,
  tenantId: string,
  options?: { replace?: boolean },
): Promise<SeedPopeMenuResult> {
  if (options?.replace) {
    const cleared = await clearTenantFbCatalog(supabase, tenantId);
    if (!cleared.ok) return { ok: false, error: cleared.error };
  }

  const payload = buildPopeMenuPayload(tenantId);

  try {
    const { error: settingsError } = await supabase
      .schema("hotel")
      .from("tenant_fb_settings")
      .upsert(payload.tenantFbSettings, { onConflict: "tenant_id" });
    if (settingsError) throw new Error(`tenant_fb_settings: ${settingsError.message}`);

    await upsertBatch(supabase, "fb_outlets", payload.outlets);
    await upsertBatch(supabase, "fb_stations", payload.stations);
    await upsertBatch(supabase, "fb_menu_categories", payload.categories);
    await upsertBatch(supabase, "fb_menu_items", payload.menuItems);
    await upsertBatch(supabase, "fb_tables", payload.tables);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return {
    ok: true,
    message:
      `Pope menu loaded: Menu 1 (bar) ${payload.counts.barItems} items, ` +
      `Menu 2 (restaurant) ${payload.counts.restaurantItems} items, ` +
      `${payload.counts.categories} categories, ${payload.tables.length} tables.`,
  };
}
