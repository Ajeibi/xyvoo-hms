import type { SupabaseClient } from "@supabase/supabase-js";
import type { FbMenuCategoryRow, FbMenuItemRow, FbOutletRow, FbStationRow, FbTableRow } from "@/lib/hms/fb-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export async function ensureFbDefaults(_supabase: SupabaseClient, _tenantId: string) {
  // Menu sections (outlets) are created in Settings → Menu setup.
}

function slugifyOutletCode(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return base.slice(0, 32) || `outlet_${Date.now()}`;
}

export async function upsertOutlet(
  supabase: SupabaseClient,
  tenantId: string,
  input: {
    id?: string;
    name: string;
    outletType: FbOutletRow["outlet_type"];
    code?: string;
    isActive?: boolean;
  },
) {
  const code = (input.code?.trim() || slugifyOutletCode(input.name)).slice(0, 32);
  const row = {
    tenant_id: tenantId,
    code,
    name: input.name.trim(),
    outlet_type: input.outletType,
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  };

  if (input.id) {
    const { data, error } = await supabase
      .schema("hotel")
      .from("fb_outlets")
      .update(row)
      .eq("id", input.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    return { outlet: data ? mapOutlet(data) : null, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_outlets")
    .insert(row)
    .select("*")
    .single();
  return { outlet: data ? mapOutlet(data) : null, error: error?.message ?? null };
}

export async function deleteOutlet(supabase: SupabaseClient, tenantId: string, outletId: string) {
  const { error } = await supabase
    .schema("hotel")
    .from("fb_outlets")
    .delete()
    .eq("id", outletId)
    .eq("tenant_id", tenantId);
  return { error: error?.message ?? null };
}

export async function loadFbConfig(
  supabase: SupabaseClient,
  tenantId: string,
  options?: { seedDefaults?: boolean },
) {
  if (options?.seedDefaults !== false) {
    await ensureFbDefaults(supabase, tenantId);
  }

  const [outletsRes, stationsRes, categoriesRes, itemsRes, tablesRes] = await Promise.all([
    supabase.schema("hotel").from("fb_outlets").select("*").eq("tenant_id", tenantId).order("code"),
    supabase.schema("hotel").from("fb_stations").select("*").eq("tenant_id", tenantId).order("sort_order"),
    supabase.schema("hotel").from("fb_menu_categories").select("*").eq("tenant_id", tenantId).order("sort_order"),
    supabase.schema("hotel").from("fb_menu_items").select("*").eq("tenant_id", tenantId).order("sort_order"),
    supabase.schema("hotel").from("fb_tables").select("*").eq("tenant_id", tenantId).order("table_code"),
  ]);

  return {
    outlets: (outletsRes.data ?? []).map(mapOutlet),
    stations: (stationsRes.data ?? []).map(mapStation),
    categories: (categoriesRes.data ?? []).map(mapCategory),
    items: (itemsRes.data ?? []).map(mapMenuItem),
    tables: (tablesRes.data ?? []).map(mapTable),
  };
}

function mapOutlet(r: Record<string, unknown>): FbOutletRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    code: r.code as string,
    name: r.name as string,
    outlet_type: r.outlet_type as FbOutletRow["outlet_type"],
    is_active: Boolean(r.is_active),
  };
}

function mapStation(r: Record<string, unknown>): FbStationRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    code: r.code as string,
    name: r.name as string,
    sort_order: Number(r.sort_order) || 0,
    is_active: Boolean(r.is_active),
  };
}

function mapCategory(r: Record<string, unknown>): FbMenuCategoryRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    outlet_id: r.outlet_id as string,
    name: r.name as string,
    sort_order: Number(r.sort_order) || 0,
    is_active: Boolean(r.is_active),
  };
}

export function mapMenuItem(r: Record<string, unknown>): FbMenuItemRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    outlet_id: r.outlet_id as string,
    category_id: (r.category_id as string) ?? null,
    station_id: (r.station_id as string) ?? null,
    name: r.name as string,
    description: (r.description as string) ?? null,
    price: num(r.price),
    is_available: Boolean(r.is_available),
    eighty_sixed_at: (r.eighty_sixed_at as string) ?? null,
    sort_order: Number(r.sort_order) || 0,
  };
}

function mapTable(r: Record<string, unknown>): FbTableRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    outlet_id: r.outlet_id as string,
    table_code: r.table_code as string,
    covers: Number(r.covers) || 4,
    status: r.status as FbTableRow["status"],
  };
}

export async function upsertMenuItem(
  supabase: SupabaseClient,
  tenantId: string,
  input: {
    id?: string;
    outletId: string;
    categoryId?: string | null;
    stationId?: string | null;
    name: string;
    price: number;
    description?: string | null;
    sortOrder?: number;
    isAvailable?: boolean;
  },
) {
  const row = {
    tenant_id: tenantId,
    outlet_id: input.outletId,
    category_id: input.categoryId ?? null,
    station_id: input.stationId ?? null,
    name: input.name.trim(),
    description: input.description?.trim() ?? null,
    price: input.price,
    updated_at: new Date().toISOString(),
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    ...(input.isAvailable !== undefined ? { is_available: input.isAvailable } : {}),
  };

  if (input.id) {
    const { data, error } = await supabase
      .schema("hotel")
      .from("fb_menu_items")
      .update(row)
      .eq("id", input.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    return { item: data ? mapMenuItem(data) : null, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_menu_items")
    .insert(row)
    .select("*")
    .single();
  return { item: data ? mapMenuItem(data) : null, error: error?.message ?? null };
}

export async function upsertMenuCategory(
  supabase: SupabaseClient,
  tenantId: string,
  input: { id?: string; outletId: string; name: string; sortOrder?: number; isActive?: boolean },
) {
  const row = {
    tenant_id: tenantId,
    outlet_id: input.outletId,
    name: input.name.trim(),
    sort_order: input.sortOrder ?? 0,
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  };

  if (input.id) {
    const { data, error } = await supabase
      .schema("hotel")
      .from("fb_menu_categories")
      .update(row)
      .eq("id", input.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    return { category: data ? mapCategory(data) : null, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_menu_categories")
    .insert(row)
    .select("*")
    .single();
  return { category: data ? mapCategory(data) : null, error: error?.message ?? null };
}

function slugifyStationCode(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return base.slice(0, 32) || `station_${Date.now()}`;
}

export async function upsertStation(
  supabase: SupabaseClient,
  tenantId: string,
  input: { id?: string; name: string; code?: string; sortOrder?: number },
) {
  const code = (input.code?.trim() || slugifyStationCode(input.name)).slice(0, 32);
  const row = {
    tenant_id: tenantId,
    code,
    name: input.name.trim(),
    sort_order: input.sortOrder ?? 0,
  };

  if (input.id) {
    const { data, error } = await supabase
      .schema("hotel")
      .from("fb_stations")
      .update(row)
      .eq("id", input.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    return { station: data ? mapStation(data) : null, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_stations")
    .insert(row)
    .select("*")
    .single();
  return { station: data ? mapStation(data) : null, error: error?.message ?? null };
}

export async function deleteStation(supabase: SupabaseClient, tenantId: string, stationId: string) {
  const { error } = await supabase
    .schema("hotel")
    .from("fb_stations")
    .delete()
    .eq("id", stationId)
    .eq("tenant_id", tenantId);
  return { error: error?.message ?? null };
}

export async function loadStations(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_stations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) return { stations: [] as FbStationRow[], error: error.message };
  return { stations: (data ?? []).map(mapStation), error: null };
}

export async function upsertTable(
  supabase: SupabaseClient,
  tenantId: string,
  input: { id?: string; outletId: string; tableCode: string; covers: number },
) {
  const row = {
    tenant_id: tenantId,
    outlet_id: input.outletId,
    table_code: input.tableCode.trim(),
    covers: input.covers,
  };

  if (input.id) {
    const { data, error } = await supabase
      .schema("hotel")
      .from("fb_tables")
      .update(row)
      .eq("id", input.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    return { table: data ? mapTable(data) : null, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_tables")
    .insert(row)
    .select("*")
    .single();
  return { table: data ? mapTable(data) : null, error: error?.message ?? null };
}

export async function loadMenuForAdmin(supabase: SupabaseClient, tenantId: string) {
  await ensureFbDefaults(supabase, tenantId);
  return loadFbConfig(supabase, tenantId, { seedDefaults: false });
}

/** Outlets + stations only — for fast section/station CRUD without reloading the full menu. */
export async function loadMenuSetupMeta(supabase: SupabaseClient, tenantId: string) {
  const [outletsRes, stationsRes] = await Promise.all([
    supabase.schema("hotel").from("fb_outlets").select("*").eq("tenant_id", tenantId).order("code"),
    supabase.schema("hotel").from("fb_stations").select("*").eq("tenant_id", tenantId).order("sort_order"),
  ]);

  return {
    outlets: (outletsRes.data ?? []).map(mapOutlet),
    stations: (stationsRes.data ?? []).map(mapStation),
  };
}

/** Categories + items only — for fast menu content deletes without reloading outlets/stations/tables. */
export async function loadMenuContentForAdmin(supabase: SupabaseClient, tenantId: string) {
  const [categoriesRes, itemsRes] = await Promise.all([
    supabase.schema("hotel").from("fb_menu_categories").select("*").eq("tenant_id", tenantId).order("sort_order"),
    supabase.schema("hotel").from("fb_menu_items").select("*").eq("tenant_id", tenantId).order("sort_order"),
  ]);

  return {
    categories: (categoriesRes.data ?? []).map(mapCategory),
    items: (itemsRes.data ?? []).map(mapMenuItem),
  };
}

export type MenuSetupBatchPayload = {
  upsertCategories?: {
    id?: string;
    outletId: string;
    name: string;
    sortOrder?: number;
    isActive?: boolean;
  }[];
  upsertItems?: {
    id?: string;
    outletId: string;
    categoryId?: string | null;
    stationId?: string | null;
    name: string;
    price: number;
    description?: string | null;
    sortOrder?: number;
    isAvailable?: boolean;
  }[];
  deleteCategoryIds?: string[];
  deleteItemIds?: string[];
  upsertOutlets?: {
    id?: string;
    name: string;
    outletType: FbOutletRow["outlet_type"];
    code?: string;
    isActive?: boolean;
  }[];
  deleteOutletIds?: string[];
  upsertStations?: {
    id?: string;
    name: string;
    code?: string;
    sortOrder?: number;
  }[];
  deleteStationIds?: string[];
  reorderCategories?: { id: string; sortOrder: number }[];
  reorderItems?: { id: string; sortOrder: number }[];
};

export function isMenuSetupMetaOnlyMutation(payload: MenuSetupBatchPayload) {
  return (
    (payload.upsertCategories?.length ?? 0) === 0 &&
    (payload.upsertItems?.length ?? 0) === 0 &&
    (payload.deleteCategoryIds?.length ?? 0) === 0 &&
    (payload.deleteItemIds?.length ?? 0) === 0 &&
    (payload.reorderCategories?.length ?? 0) === 0 &&
    (payload.reorderItems?.length ?? 0) === 0
  );
}

export function isMenuSetupContentOnlyMutation(payload: MenuSetupBatchPayload) {
  return (
    (payload.upsertOutlets?.length ?? 0) === 0 &&
    (payload.deleteOutletIds?.length ?? 0) === 0 &&
    (payload.upsertStations?.length ?? 0) === 0 &&
    (payload.deleteStationIds?.length ?? 0) === 0
  );
}

export type PublicMenuItem = {
  id: string;
  name: string;
  price: number;
  description: string | null;
};

export type PublicMenuCategory = {
  id: string;
  name: string;
  items: PublicMenuItem[];
};

export type PublicMenuOutlet = {
  id: string;
  name: string;
  outlet_type: FbOutletRow["outlet_type"];
  categories: PublicMenuCategory[];
};

export async function loadPublicMenu(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PublicMenuOutlet[]> {
  const [outletsRes, categoriesRes, itemsRes] = await Promise.all([
    supabase
      .schema("hotel")
      .from("fb_outlets")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("code"),
    supabase
      .schema("hotel")
      .from("fb_menu_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .schema("hotel")
      .from("fb_menu_items")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_available", true)
      .is("eighty_sixed_at", null)
      .order("sort_order"),
  ]);

  const outlets = (outletsRes.data ?? []).map(mapOutlet);
  const categories = (categoriesRes.data ?? []).map(mapCategory);
  const items = (itemsRes.data ?? []).map(mapMenuItem);

  return outlets.map((outlet) => {
    const outletCategories = categories
      .filter((c) => c.outlet_id === outlet.id)
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        items: items
          .filter((i) => i.category_id === cat.id)
          .map((i) => ({
            id: i.id,
            name: i.name,
            price: i.price,
            description: i.description,
          })),
      }))
      .filter((c) => c.items.length > 0);

    return {
      id: outlet.id,
      name: outlet.name,
      outlet_type: outlet.outlet_type,
      categories: outletCategories,
    };
  });
}

export async function deleteMenuItem(supabase: SupabaseClient, tenantId: string, itemId: string) {
  const { error } = await supabase
    .schema("hotel")
    .from("fb_menu_items")
    .delete()
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  return { error: error?.message ?? null };
}

export async function deleteMenuCategory(
  supabase: SupabaseClient,
  tenantId: string,
  categoryId: string,
) {
  await supabase
    .schema("hotel")
    .from("fb_menu_items")
    .delete()
    .eq("category_id", categoryId)
    .eq("tenant_id", tenantId);

  const { error } = await supabase
    .schema("hotel")
    .from("fb_menu_categories")
    .delete()
    .eq("id", categoryId)
    .eq("tenant_id", tenantId);
  return { error: error?.message ?? null };
}

export async function reorderMenuCategories(
  supabase: SupabaseClient,
  tenantId: string,
  rows: { id: string; sortOrder: number }[],
) {
  for (const row of rows) {
    const { error } = await supabase
      .schema("hotel")
      .from("fb_menu_categories")
      .update({ sort_order: row.sortOrder })
      .eq("id", row.id)
      .eq("tenant_id", tenantId);
    if (error) return { error: error.message };
  }
  return { error: null };
}

export async function reorderMenuItems(
  supabase: SupabaseClient,
  tenantId: string,
  rows: { id: string; sortOrder: number }[],
) {
  for (const row of rows) {
    const { error } = await supabase
      .schema("hotel")
      .from("fb_menu_items")
      .update({ sort_order: row.sortOrder, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("tenant_id", tenantId);
    if (error) return { error: error.message };
  }
  return { error: null };
}

export async function saveMenuSetupBatch(
  supabase: SupabaseClient,
  tenantId: string,
  payload: MenuSetupBatchPayload,
) {
  const needsOutletAssert =
    (payload.upsertCategories?.length ?? 0) > 0 || (payload.upsertItems?.length ?? 0) > 0;

  const assertOutlet = (outletId: string) => {
    if (!outletIds.has(outletId)) throw new Error("Invalid outlet for this property.");
  };

  let outletIds = new Set<string>();
  if (needsOutletAssert) {
    const { data: tenantOutlets } = await supabase
      .schema("hotel")
      .from("fb_outlets")
      .select("id")
      .eq("tenant_id", tenantId);
    outletIds = new Set((tenantOutlets ?? []).map((o) => o.id as string));
  }

  for (const id of payload.deleteItemIds ?? []) {
    const result = await deleteMenuItem(supabase, tenantId, id);
    if (result.error) return { error: result.error };
  }

  for (const id of payload.deleteCategoryIds ?? []) {
    const result = await deleteMenuCategory(supabase, tenantId, id);
    if (result.error) return { error: result.error };
  }

  for (const id of payload.deleteOutletIds ?? []) {
    const result = await deleteOutlet(supabase, tenantId, id);
    if (result.error) return { error: result.error };
  }

  for (const outlet of payload.upsertOutlets ?? []) {
    const result = await upsertOutlet(supabase, tenantId, outlet);
    if (result.error) return { error: result.error };
  }

  for (const id of payload.deleteStationIds ?? []) {
    const result = await deleteStation(supabase, tenantId, id);
    if (result.error) return { error: result.error };
  }

  for (const station of payload.upsertStations ?? []) {
    const result = await upsertStation(supabase, tenantId, station);
    if (result.error) return { error: result.error };
  }

  for (const cat of payload.upsertCategories ?? []) {
    assertOutlet(cat.outletId);
    const result = await upsertMenuCategory(supabase, tenantId, cat);
    if (result.error) return { error: result.error };
  }

  for (const item of payload.upsertItems ?? []) {
    assertOutlet(item.outletId);
    if (!item.name.trim()) return { error: "Item name is required." };
    const result = await upsertMenuItem(supabase, tenantId, item);
    if (result.error) return { error: result.error };
  }

  if (payload.reorderCategories?.length) {
    const result = await reorderMenuCategories(supabase, tenantId, payload.reorderCategories);
    if (result.error) return { error: result.error };
  }

  if (payload.reorderItems?.length) {
    const result = await reorderMenuItems(supabase, tenantId, payload.reorderItems);
    if (result.error) return { error: result.error };
  }

  return { error: null };
}
