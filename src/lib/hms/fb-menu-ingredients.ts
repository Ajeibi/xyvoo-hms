import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveInventoryItemDisplay } from "@/lib/hms/inventory-stock";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export type FbMenuItemIngredient = {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  inventory_item_id: string;
  qty_per_serving: number;
  item_name: string;
  item_sku: string;
  unit_of_measure: string;
};

export async function listIngredientsForMenuItem(
  supabase: SupabaseClient,
  tenantId: string,
  menuItemId: string,
): Promise<FbMenuItemIngredient[]> {
  const { data } = await supabase
    .schema("hotel")
    .from("fb_menu_item_ingredients")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("menu_item_id", menuItemId);

  const rows = data ?? [];
  const itemIds = [...new Set(rows.map((r) => r.inventory_item_id as string))];
  const itemById = await resolveInventoryItemDisplay(supabase, tenantId, itemIds);

  return rows.map((r) => {
    const item = itemById.get(r.inventory_item_id as string);
    return {
      id: r.id as string,
      tenant_id: r.tenant_id as string,
      menu_item_id: r.menu_item_id as string,
      inventory_item_id: r.inventory_item_id as string,
      qty_per_serving: num(r.qty_per_serving),
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? "",
      unit_of_measure: item?.unit_of_measure ?? "—",
    };
  });
}

/** Replaces the full ingredient list for a menu item in one call. */
export async function setIngredientsForMenuItem(
  supabase: SupabaseClient,
  tenantId: string,
  menuItemId: string,
  ingredients: { inventoryItemId: string; qtyPerServing: number }[],
) {
  await supabase
    .schema("hotel")
    .from("fb_menu_item_ingredients")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("menu_item_id", menuItemId);

  const rows = ingredients.filter((i) => i.qtyPerServing > 0);
  if (!rows.length) return { error: null };

  const { error } = await supabase.schema("hotel").from("fb_menu_item_ingredients").insert(
    rows.map((i) => ({
      tenant_id: tenantId,
      menu_item_id: menuItemId,
      inventory_item_id: i.inventoryItemId,
      qty_per_serving: i.qtyPerServing,
    })),
  );
  if (error) return { error: error.message };
  return { error: null };
}

export async function listIngredientsForMenuItems(
  supabase: SupabaseClient,
  tenantId: string,
  menuItemIds: string[],
): Promise<Map<string, { inventory_item_id: string; qty_per_serving: number }[]>> {
  const map = new Map<string, { inventory_item_id: string; qty_per_serving: number }[]>();
  if (!menuItemIds.length) return map;

  const { data } = await supabase
    .schema("hotel")
    .from("fb_menu_item_ingredients")
    .select("menu_item_id,inventory_item_id,qty_per_serving")
    .eq("tenant_id", tenantId)
    .in("menu_item_id", menuItemIds);

  for (const r of data ?? []) {
    const list = map.get(r.menu_item_id as string) ?? [];
    list.push({ inventory_item_id: r.inventory_item_id as string, qty_per_serving: num(r.qty_per_serving) });
    map.set(r.menu_item_id as string, list);
  }
  return map;
}
