import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InventoryCategoryRow,
  InventoryItemRow,
  InventoryItemTypeRow,
  InventoryLocationRow,
  InventoryLocationTypeRow,
  InventorySupplierRow,
  InventoryUnitRow,
} from "@/lib/hms/inventory-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function mapCategory(r: Record<string, unknown>): InventoryCategoryRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    name: r.name as string,
    parent_id: (r.parent_id as string) ?? null,
    sort_order: Number(r.sort_order) || 0,
    created_at: r.created_at as string,
  };
}

function mapLookupRow(r: Record<string, unknown>): InventoryUnitRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    name: r.name as string,
    code: r.code as string,
    sort_order: Number(r.sort_order) || 0,
    is_active: Boolean(r.is_active),
    created_at: r.created_at as string,
  };
}

async function listLookup(supabase: SupabaseClient, tenantId: string, table: string) {
  const { data } = await supabase
    .schema("hotel")
    .from(table)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => mapLookupRow(r as Record<string, unknown>));
}

async function createLookup(
  supabase: SupabaseClient,
  table: string,
  params: { tenantId: string; name: string; code?: string; sortOrder?: number },
) {
  const code = (params.code?.trim() || params.name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  const { data, error } = await supabase
    .schema("hotel")
    .from(table)
    .insert({ tenant_id: params.tenantId, name: params.name.trim(), code, sort_order: params.sortOrder ?? 0 })
    .select("*")
    .single();
  if (error || !data) return { row: null, error: error?.message ?? "Could not create." };
  return { row: mapLookupRow(data as Record<string, unknown>), error: null };
}

async function updateLookup(
  supabase: SupabaseClient,
  table: string,
  tenantId: string,
  id: string,
  patch: { name?: string; sortOrder?: number; isActive?: boolean },
) {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { data, error } = await supabase
    .schema("hotel")
    .from(table)
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { row: null, error: error?.message ?? "Could not update." };
  return { row: mapLookupRow(data as Record<string, unknown>), error: null };
}

async function deleteLookup(supabase: SupabaseClient, table: string, tenantId: string, id: string) {
  const { error } = await supabase.schema("hotel").from(table).delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) {
    if (error.code === "23503") {
      return { error: "Still in use by one or more items or stores — deactivate it instead, or remove it from them first." };
    }
    return { error: error.message };
  }
  return { error: null };
}

// --- Units of measure ---

export const listUnits = (supabase: SupabaseClient, tenantId: string) =>
  listLookup(supabase, tenantId, "inventory_units") as Promise<InventoryUnitRow[]>;

export const createUnit = (supabase: SupabaseClient, params: { tenantId: string; name: string; code?: string; sortOrder?: number }) =>
  createLookup(supabase, "inventory_units", params) as ReturnType<typeof createLookup> as Promise<{ row: InventoryUnitRow | null; error: string | null }>;

export const updateUnit = (
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: { name?: string; sortOrder?: number; isActive?: boolean },
) => updateLookup(supabase, "inventory_units", tenantId, id, patch) as Promise<{ row: InventoryUnitRow | null; error: string | null }>;

export const deleteUnit = (supabase: SupabaseClient, tenantId: string, id: string) =>
  deleteLookup(supabase, "inventory_units", tenantId, id);

// --- Item types ---
// Item types carry two behavioral flags (is_fixed_asset, is_equipment) that
// units and location types don't need, so they get their own mapper/CRUD
// instead of sharing the generic lookup helpers above.

function mapItemTypeRow(r: Record<string, unknown>): InventoryItemTypeRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    name: r.name as string,
    code: r.code as string,
    sort_order: Number(r.sort_order) || 0,
    is_active: Boolean(r.is_active),
    is_fixed_asset: Boolean(r.is_fixed_asset),
    is_equipment: Boolean(r.is_equipment),
    created_at: r.created_at as string,
  };
}

export async function listItemTypes(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_item_types")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => mapItemTypeRow(r as Record<string, unknown>));
}

export async function createItemType(
  supabase: SupabaseClient,
  params: { tenantId: string; name: string; code?: string; sortOrder?: number; isFixedAsset?: boolean; isEquipment?: boolean },
) {
  const code = (params.code?.trim() || params.name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_item_types")
    .insert({
      tenant_id: params.tenantId,
      name: params.name.trim(),
      code,
      sort_order: params.sortOrder ?? 0,
      is_fixed_asset: params.isFixedAsset ?? false,
      is_equipment: params.isEquipment ?? false,
    })
    .select("*")
    .single();
  if (error || !data) return { row: null, error: error?.message ?? "Could not create." };
  return { row: mapItemTypeRow(data as Record<string, unknown>), error: null };
}

export async function updateItemType(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: { name?: string; sortOrder?: number; isActive?: boolean; isFixedAsset?: boolean; isEquipment?: boolean },
) {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.isFixedAsset !== undefined) update.is_fixed_asset = patch.isFixedAsset;
  if (patch.isEquipment !== undefined) update.is_equipment = patch.isEquipment;

  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_item_types")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { row: null, error: error?.message ?? "Could not update." };
  return { row: mapItemTypeRow(data as Record<string, unknown>), error: null };
}

export const deleteItemType = (supabase: SupabaseClient, tenantId: string, id: string) =>
  deleteLookup(supabase, "inventory_item_types", tenantId, id);

// --- Store location types ---

export const listLocationTypes = (supabase: SupabaseClient, tenantId: string) =>
  listLookup(supabase, tenantId, "inventory_location_types") as Promise<InventoryLocationTypeRow[]>;

export const createLocationType = (supabase: SupabaseClient, params: { tenantId: string; name: string; code?: string; sortOrder?: number }) =>
  createLookup(supabase, "inventory_location_types", params) as Promise<{ row: InventoryLocationTypeRow | null; error: string | null }>;

export const updateLocationType = (
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: { name?: string; sortOrder?: number; isActive?: boolean },
) => updateLookup(supabase, "inventory_location_types", tenantId, id, patch) as Promise<{ row: InventoryLocationTypeRow | null; error: string | null }>;

export const deleteLocationType = (supabase: SupabaseClient, tenantId: string, id: string) =>
  deleteLookup(supabase, "inventory_location_types", tenantId, id);

// --- Suppliers ---
// Suppliers carry contact fields the generic lookup helpers above don't
// support, so they get their own mapper/CRUD (same reasoning as item types).

function mapSupplierRow(r: Record<string, unknown>): InventorySupplierRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    name: r.name as string,
    contact_name: (r.contact_name as string) ?? null,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    notes: (r.notes as string) ?? null,
    is_active: Boolean(r.is_active),
    created_at: r.created_at as string,
  };
}

export async function listSuppliers(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_suppliers")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  return (data ?? []).map((r) => mapSupplierRow(r as Record<string, unknown>));
}

export async function createSupplier(
  supabase: SupabaseClient,
  params: { tenantId: string; name: string; contactName?: string; phone?: string; email?: string; notes?: string },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_suppliers")
    .insert({
      tenant_id: params.tenantId,
      name: params.name.trim(),
      contact_name: params.contactName?.trim() || null,
      phone: params.phone?.trim() || null,
      email: params.email?.trim() || null,
      notes: params.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (error || !data) return { supplier: null, error: error?.message ?? "Could not create supplier." };
  return { supplier: mapSupplierRow(data as Record<string, unknown>), error: null };
}

export async function updateSupplier(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  patch: { name?: string; contactName?: string | null; phone?: string | null; email?: string | null; notes?: string | null; isActive?: boolean },
) {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.contactName !== undefined) update.contact_name = patch.contactName?.trim() || null;
  if (patch.phone !== undefined) update.phone = patch.phone?.trim() || null;
  if (patch.email !== undefined) update.email = patch.email?.trim() || null;
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_suppliers")
    .update(update)
    .eq("id", supplierId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { supplier: null, error: error?.message ?? "Could not update supplier." };
  return { supplier: mapSupplierRow(data as Record<string, unknown>), error: null };
}

export async function deleteSupplier(supabase: SupabaseClient, tenantId: string, supplierId: string) {
  const { error } = await supabase.schema("hotel").from("inventory_suppliers").delete().eq("id", supplierId).eq("tenant_id", tenantId);
  if (error) {
    if (error.code === "23503") {
      return { error: "Still referenced by one or more receipts — deactivate it instead." };
    }
    return { error: error.message };
  }
  return { error: null };
}

// --- Locations (stores) ---

async function attachLocationTypeNames(
  supabase: SupabaseClient,
  tenantId: string,
  rows: Record<string, unknown>[],
): Promise<InventoryLocationRow[]> {
  const typeIds = [...new Set(rows.map((r) => r.location_type as string))];
  const nameById = new Map<string, string>();
  if (typeIds.length) {
    const { data } = await supabase
      .schema("hotel")
      .from("inventory_location_types")
      .select("id,name")
      .eq("tenant_id", tenantId)
      .in("id", typeIds);
    for (const t of data ?? []) nameById.set(t.id as string, t.name as string);
  }
  return rows.map((r) => ({
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    name: r.name as string,
    location_type: r.location_type as string,
    location_type_name: nameById.get(r.location_type as string) ?? "Unknown type",
    is_active: Boolean(r.is_active),
    created_at: r.created_at as string,
  }));
}

export async function listLocations(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_locations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  return attachLocationTypeNames(supabase, tenantId, (data ?? []) as Record<string, unknown>[]);
}

export async function createLocation(
  supabase: SupabaseClient,
  params: { tenantId: string; name: string; locationTypeId: string },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_locations")
    .insert({ tenant_id: params.tenantId, name: params.name.trim(), location_type: params.locationTypeId })
    .select("*")
    .single();
  if (error || !data) return { location: null, error: error?.message ?? "Could not create store location." };
  const [location] = await attachLocationTypeNames(supabase, params.tenantId, [data as Record<string, unknown>]);
  return { location, error: null };
}

export async function updateLocation(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  patch: { name?: string; locationTypeId?: string; isActive?: boolean },
) {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.locationTypeId !== undefined) update.location_type = patch.locationTypeId;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_locations")
    .update(update)
    .eq("id", locationId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { location: null, error: error?.message ?? "Could not update store location." };
  const [location] = await attachLocationTypeNames(supabase, tenantId, [data as Record<string, unknown>]);
  return { location, error: null };
}

// --- Categories ---

export async function listCategories(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => mapCategory(r as Record<string, unknown>));
}

export async function createCategory(
  supabase: SupabaseClient,
  params: { tenantId: string; name: string; parentId?: string | null },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_categories")
    .insert({ tenant_id: params.tenantId, name: params.name.trim(), parent_id: params.parentId ?? null })
    .select("*")
    .single();
  if (error || !data) return { category: null, error: error?.message ?? "Could not create category." };
  return { category: mapCategory(data as Record<string, unknown>), error: null };
}

export async function updateCategory(
  supabase: SupabaseClient,
  tenantId: string,
  categoryId: string,
  patch: { name?: string; parentId?: string | null; sortOrder?: number },
) {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.parentId !== undefined) update.parent_id = patch.parentId;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_categories")
    .update(update)
    .eq("id", categoryId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { category: null, error: error?.message ?? "Could not update category." };
  return { category: mapCategory(data as Record<string, unknown>), error: null };
}

export async function deleteCategory(supabase: SupabaseClient, tenantId: string, categoryId: string) {
  const { error } = await supabase
    .schema("hotel")
    .from("inventory_categories")
    .delete()
    .eq("id", categoryId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  return { error: null };
}

// --- Items ---

async function attachItemLookupNames(
  supabase: SupabaseClient,
  tenantId: string,
  rows: Record<string, unknown>[],
): Promise<InventoryItemRow[]> {
  const unitIds = [
    ...new Set([...rows.map((r) => r.unit_of_measure as string), ...rows.map((r) => r.purchase_unit_id as string).filter(Boolean)]),
  ];
  const typeIds = [...new Set(rows.map((r) => r.item_type as string))];

  const [{ data: units }, { data: types }] = await Promise.all([
    unitIds.length
      ? supabase.schema("hotel").from("inventory_units").select("id,name").eq("tenant_id", tenantId).in("id", unitIds)
      : Promise.resolve({ data: [] }),
    typeIds.length
      ? supabase
          .schema("hotel")
          .from("inventory_item_types")
          .select("id,name,is_fixed_asset,is_equipment")
          .eq("tenant_id", tenantId)
          .in("id", typeIds)
      : Promise.resolve({ data: [] }),
  ]);

  const unitNameById = new Map((units ?? []).map((u) => [u.id as string, u.name as string]));
  const typeById = new Map(
    (types ?? []).map((t) => [
      t.id as string,
      { name: t.name as string, isFixedAsset: Boolean(t.is_fixed_asset), isEquipment: Boolean(t.is_equipment) },
    ]),
  );

  return rows.map((r) => {
    const type = typeById.get(r.item_type as string);
    return {
      id: r.id as string,
      tenant_id: r.tenant_id as string,
      sku: r.sku as string,
      name: r.name as string,
      category_id: (r.category_id as string) ?? null,
      unit_of_measure: r.unit_of_measure as string,
      unit_of_measure_name: unitNameById.get(r.unit_of_measure as string) ?? "Unknown unit",
      purchase_unit_id: (r.purchase_unit_id as string) ?? null,
      purchase_unit_name: r.purchase_unit_id ? (unitNameById.get(r.purchase_unit_id as string) ?? "Unknown unit") : null,
      purchase_to_issue_factor: num(r.purchase_to_issue_factor) || 1,
      item_type: r.item_type as string,
      item_type_name: type?.name ?? "Unknown type",
      item_type_is_fixed_asset: type?.isFixedAsset ?? false,
      item_type_is_equipment: type?.isEquipment ?? false,
      unit_cost: num(r.unit_cost),
      barcode: (r.barcode as string) ?? null,
      is_active: Boolean(r.is_active),
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    };
  });
}

export async function listItems(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { categoryId?: string; activeOnly?: boolean; search?: string; excludeFixedAssets?: boolean },
) {
  let q = supabase.schema("hotel").from("inventory_items").select("*").eq("tenant_id", tenantId).order("name", { ascending: true });
  if (opts?.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts?.activeOnly) q = q.eq("is_active", true);
  if (opts?.search) q = q.or(`name.ilike.%${opts.search}%,sku.ilike.%${opts.search}%`);

  const { data } = await q;
  const items = await attachItemLookupNames(supabase, tenantId, (data ?? []) as Record<string, unknown>[]);
  return opts?.excludeFixedAssets ? items.filter((i) => !i.item_type_is_fixed_asset) : items;
}

export async function getItemById(supabase: SupabaseClient, tenantId: string, itemId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_items")
    .select("*")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const [item] = await attachItemLookupNames(supabase, tenantId, [data as Record<string, unknown>]);
  return item ?? null;
}

export async function createItem(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    sku: string;
    name: string;
    categoryId?: string | null;
    unitOfMeasureId: string;
    purchaseUnitId?: string | null;
    purchaseToIssueFactor?: number;
    itemTypeId: string;
    unitCost?: number;
    barcode?: string | null;
  },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_items")
    .insert({
      tenant_id: params.tenantId,
      sku: params.sku.trim(),
      name: params.name.trim(),
      category_id: params.categoryId ?? null,
      unit_of_measure: params.unitOfMeasureId,
      purchase_unit_id: params.purchaseUnitId ?? null,
      purchase_to_issue_factor: params.purchaseToIssueFactor ?? 1,
      item_type: params.itemTypeId,
      unit_cost: params.unitCost ?? 0,
      barcode: params.barcode?.trim() || null,
    })
    .select("*")
    .single();
  if (error || !data) return { item: null, error: error?.message ?? "Could not create item." };
  const [item] = await attachItemLookupNames(supabase, params.tenantId, [data as Record<string, unknown>]);
  return { item, error: null };
}

export async function updateItem(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  patch: {
    name?: string;
    categoryId?: string | null;
    unitOfMeasureId?: string;
    purchaseUnitId?: string | null;
    purchaseToIssueFactor?: number;
    itemTypeId?: string;
    unitCost?: number;
    barcode?: string | null;
    isActive?: boolean;
  },
) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.unitOfMeasureId !== undefined) update.unit_of_measure = patch.unitOfMeasureId;
  if (patch.purchaseUnitId !== undefined) update.purchase_unit_id = patch.purchaseUnitId;
  if (patch.purchaseToIssueFactor !== undefined) update.purchase_to_issue_factor = patch.purchaseToIssueFactor;
  if (patch.itemTypeId !== undefined) update.item_type = patch.itemTypeId;
  if (patch.unitCost !== undefined) update.unit_cost = patch.unitCost;
  if (patch.barcode !== undefined) update.barcode = patch.barcode?.trim() || null;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_items")
    .update(update)
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { item: null, error: error?.message ?? "Could not update item." };
  const [item] = await attachItemLookupNames(supabase, tenantId, [data as Record<string, unknown>]);
  return { item, error: null };
}
