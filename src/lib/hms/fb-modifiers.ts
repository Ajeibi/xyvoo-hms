import type { SupabaseClient } from "@supabase/supabase-js";
import type { FbModifierGroupDef } from "@/lib/hms/fb-modifier-rules";
import type {
  FbMenuItemModifierLink,
  FbModifierGroupRow,
  FbModifierOptionRow,
  FbOrderItemModifier,
} from "@/lib/hms/fb-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function mapOption(r: Record<string, unknown>): FbModifierOptionRow {
  return {
    id: r.id as string,
    group_id: r.group_id as string,
    name: r.name as string,
    price_delta: num(r.price_delta),
    sort_order: Number(r.sort_order) || 0,
    is_active: Boolean(r.is_active),
  };
}

/** Every choice group with its options, plus which menu items use which groups. */
export async function loadModifierSetup(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ groups: FbModifierGroupRow[]; links: FbMenuItemModifierLink[] }> {
  const [groupsRes, optionsRes, linksRes] = await Promise.all([
    supabase.schema("hotel").from("fb_modifier_groups").select("*").eq("tenant_id", tenantId).order("sort_order").order("name"),
    supabase.schema("hotel").from("fb_modifier_options").select("*").eq("tenant_id", tenantId).order("sort_order"),
    supabase.schema("hotel").from("fb_menu_item_modifier_groups").select("menu_item_id,group_id,sort_order").eq("tenant_id", tenantId),
  ]);

  const optionsByGroup = new Map<string, FbModifierOptionRow[]>();
  for (const row of optionsRes.data ?? []) {
    const option = mapOption(row as Record<string, unknown>);
    const list = optionsByGroup.get(option.group_id) ?? [];
    list.push(option);
    optionsByGroup.set(option.group_id, list);
  }

  const groups = (groupsRes.data ?? []).map((r) => ({
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    name: r.name as string,
    min_select: Number(r.min_select) || 0,
    max_select: r.max_select == null ? null : Number(r.max_select),
    sort_order: Number(r.sort_order) || 0,
    is_active: Boolean(r.is_active),
    options: optionsByGroup.get(r.id as string) ?? [],
  }));

  const links = (linksRes.data ?? []).map((r) => ({
    menu_item_id: r.menu_item_id as string,
    group_id: r.group_id as string,
    sort_order: Number(r.sort_order) || 0,
  }));

  return { groups, links };
}

export async function loadModifierGroupsForMenuItem(
  supabase: SupabaseClient,
  tenantId: string,
  menuItemId: string,
): Promise<FbModifierGroupDef[]> {
  const { data: links } = await supabase
    .schema("hotel")
    .from("fb_menu_item_modifier_groups")
    .select("group_id,sort_order")
    .eq("tenant_id", tenantId)
    .eq("menu_item_id", menuItemId);
  if (!links?.length) return [];

  const groupIds = links.map((l) => l.group_id as string);
  const [groupsRes, optionsRes] = await Promise.all([
    supabase.schema("hotel").from("fb_modifier_groups").select("*").eq("tenant_id", tenantId).in("id", groupIds),
    supabase.schema("hotel").from("fb_modifier_options").select("*").eq("tenant_id", tenantId).in("group_id", groupIds).order("sort_order"),
  ]);
  const options = (optionsRes.data ?? []).map((r) => mapOption(r as Record<string, unknown>));
  const orderOf = new Map(links.map((l) => [l.group_id as string, Number(l.sort_order) || 0]));

  return (groupsRes.data ?? [])
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      min_select: Number(r.min_select) || 0,
      max_select: r.max_select == null ? null : Number(r.max_select),
      is_active: Boolean(r.is_active),
      options: options.filter((o) => o.group_id === r.id),
    }))
    .sort((a, b) => (orderOf.get(a.id) ?? 0) - (orderOf.get(b.id) ?? 0));
}

/** order_item_id -> its chosen modifiers, in the order they were chosen. */
export async function loadOrderItemModifiers(
  supabase: SupabaseClient,
  orderItemIds: string[],
): Promise<Map<string, FbOrderItemModifier[]>> {
  const map = new Map<string, FbOrderItemModifier[]>();
  if (!orderItemIds.length) return map;
  const { data } = await supabase
    .schema("hotel")
    .from("fb_order_item_modifiers")
    .select("order_item_id,group_name,option_name,price_delta,sort_order")
    .in("order_item_id", orderItemIds)
    .order("sort_order");
  for (const r of data ?? []) {
    const list = map.get(r.order_item_id as string) ?? [];
    list.push({
      group_name: r.group_name as string,
      option_name: r.option_name as string,
      price_delta: num(r.price_delta),
    });
    map.set(r.order_item_id as string, list);
  }
  return map;
}

export type SaveModifierGroupInput = {
  id?: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  isActive: boolean;
  options: { id?: string; name: string; priceDelta: number; isActive: boolean }[];
  menuItemIds: string[];
};

/**
 * Creates or updates a group, its options (removed ones are deleted; past
 * orders keep their own snapshot) and which menu items use it.
 */
export async function saveModifierGroup(
  supabase: SupabaseClient,
  tenantId: string,
  input: SaveModifierGroupInput,
): Promise<{ groupId: string | null; error: string | null }> {
  const now = new Date().toISOString();
  const groupRow = {
    tenant_id: tenantId,
    name: input.name.trim(),
    min_select: input.minSelect,
    max_select: input.maxSelect,
    is_active: input.isActive,
    updated_at: now,
  };

  let groupId = input.id ?? null;
  if (groupId) {
    const { data, error } = await supabase
      .schema("hotel")
      .from("fb_modifier_groups")
      .update(groupRow)
      .eq("id", groupId)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (error) return { groupId: null, error: error.message };
    if (!data) return { groupId: null, error: "Choice group not found." };
  } else {
    const { count } = await supabase
      .schema("hotel")
      .from("fb_modifier_groups")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    const { data, error } = await supabase
      .schema("hotel")
      .from("fb_modifier_groups")
      .insert({ ...groupRow, sort_order: count ?? 0 })
      .select("id")
      .single();
    if (error || !data) return { groupId: null, error: error?.message ?? "Could not save the group." };
    groupId = data.id as string;
  }

  // Options: keep the ones still listed, delete the rest, then upsert in order.
  const keepIds = input.options.map((o) => o.id).filter((id): id is string => Boolean(id));
  let removeQuery = supabase
    .schema("hotel")
    .from("fb_modifier_options")
    .delete()
    .eq("group_id", groupId)
    .eq("tenant_id", tenantId);
  if (keepIds.length) removeQuery = removeQuery.not("id", "in", `(${keepIds.join(",")})`);
  const { error: removeError } = await removeQuery;
  if (removeError) return { groupId, error: removeError.message };

  for (const [index, option] of input.options.entries()) {
    const row = {
      tenant_id: tenantId,
      group_id: groupId,
      name: option.name.trim(),
      price_delta: option.priceDelta,
      is_active: option.isActive,
      sort_order: index,
    };
    const { error } = option.id
      ? await supabase
          .schema("hotel")
          .from("fb_modifier_options")
          .update(row)
          .eq("id", option.id)
          .eq("group_id", groupId)
          .eq("tenant_id", tenantId)
      : await supabase.schema("hotel").from("fb_modifier_options").insert(row);
    if (error) return { groupId, error: error.message };
  }

  // Links: only menu items of this hotel.
  const { data: validItems } = input.menuItemIds.length
    ? await supabase
        .schema("hotel")
        .from("fb_menu_items")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("id", input.menuItemIds)
    : { data: [] as { id: string }[] };
  const itemIds = (validItems ?? []).map((r) => r.id as string);

  let unlinkQuery = supabase
    .schema("hotel")
    .from("fb_menu_item_modifier_groups")
    .delete()
    .eq("group_id", groupId)
    .eq("tenant_id", tenantId);
  if (itemIds.length) unlinkQuery = unlinkQuery.not("menu_item_id", "in", `(${itemIds.join(",")})`);
  const { error: unlinkError } = await unlinkQuery;
  if (unlinkError) return { groupId, error: unlinkError.message };

  if (itemIds.length) {
    const { data: existing } = await supabase
      .schema("hotel")
      .from("fb_menu_item_modifier_groups")
      .select("menu_item_id")
      .eq("group_id", groupId)
      .eq("tenant_id", tenantId);
    const already = new Set((existing ?? []).map((r) => r.menu_item_id as string));
    const toAdd = itemIds.filter((id) => !already.has(id));
    if (toAdd.length) {
      // New links go after the item's existing groups.
      const { data: counts } = await supabase
        .schema("hotel")
        .from("fb_menu_item_modifier_groups")
        .select("menu_item_id")
        .eq("tenant_id", tenantId)
        .in("menu_item_id", toAdd);
      const countByItem = new Map<string, number>();
      for (const r of counts ?? []) {
        const id = r.menu_item_id as string;
        countByItem.set(id, (countByItem.get(id) ?? 0) + 1);
      }
      const { error } = await supabase
        .schema("hotel")
        .from("fb_menu_item_modifier_groups")
        .insert(
          toAdd.map((menuItemId) => ({
            tenant_id: tenantId,
            menu_item_id: menuItemId,
            group_id: groupId,
            sort_order: countByItem.get(menuItemId) ?? 0,
          })),
        );
      if (error) return { groupId, error: error.message };
    }
  }

  return { groupId, error: null };
}

export async function deleteModifierGroup(supabase: SupabaseClient, tenantId: string, groupId: string) {
  const { error } = await supabase
    .schema("hotel")
    .from("fb_modifier_groups")
    .delete()
    .eq("id", groupId)
    .eq("tenant_id", tenantId);
  return { error: error?.message ?? null };
}
