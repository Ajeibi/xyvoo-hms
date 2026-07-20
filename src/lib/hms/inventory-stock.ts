import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyLowStock } from "@/lib/hms/notification-rules";
import type {
  InventoryMovementType,
  InventoryMovementWithDetails,
  InventoryStockLevelWithDetails,
} from "@/lib/hms/inventory-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function hasRecentNotification(
  supabase: SupabaseClient,
  tenantId: string,
  type: string,
  entityId: string,
  hours = 12,
) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const { data } = await supabase
    .schema("hotel")
    .from("notifications")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .eq("entity_id", entityId)
    .gte("created_at", since)
    .limit(1);
  return Boolean(data?.length);
}

async function maybeNotifyLowStock(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  locationId: string,
  qtyOnHand: number,
) {
  const exists = await hasRecentNotification(supabase, tenantId, "low_stock", itemId);
  if (exists) return;

  const [itemDetails, { data: location }] = await Promise.all([
    resolveInventoryItemDisplay(supabase, tenantId, [itemId]),
    supabase.schema("hotel").from("inventory_locations").select("name").eq("id", locationId).maybeSingle(),
  ]);
  const item = itemDetails.get(itemId);
  if (!item) return;

  await notifyLowStock({
    tenantId,
    itemName: item.name,
    locationName: (location?.name as string) ?? "Store",
    qtyOnHand,
    unitOfMeasure: item.unit_of_measure,
    entityId: itemId,
  });
}

export type PostMovementParams = {
  tenantId: string;
  itemId: string;
  locationId: string;
  movementType: InventoryMovementType;
  /** Signed quantity: positive increases qty_on_hand, negative decreases it. */
  qty: number;
  unitCost?: number;
  relatedLocationId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  performedBy: string;
  note?: string | null;
};

/**
 * Single entry point for every stock-changing action. Always appends a ledger
 * row and updates the cached balance together — nothing else may write
 * qty_on_hand directly.
 */
export async function postStockMovement(supabase: SupabaseClient, params: PostMovementParams) {
  const { data: level } = await supabase
    .schema("hotel")
    .from("inventory_stock_levels")
    .select("*")
    .eq("item_id", params.itemId)
    .eq("location_id", params.locationId)
    .maybeSingle();

  const currentQty = level ? num(level.qty_on_hand) : 0;
  const newQty = round3(currentQty + params.qty);
  if (newQty < 0) {
    return { error: "Insufficient stock at this location.", movement: null, qtyOnHand: null };
  }

  const now = new Date().toISOString();
  if (level) {
    await supabase
      .schema("hotel")
      .from("inventory_stock_levels")
      .update({ qty_on_hand: newQty, updated_at: now })
      .eq("id", level.id);
  } else {
    await supabase.schema("hotel").from("inventory_stock_levels").insert({
      tenant_id: params.tenantId,
      item_id: params.itemId,
      location_id: params.locationId,
      qty_on_hand: newQty,
    });
  }

  const { data: movement, error } = await supabase
    .schema("hotel")
    .from("inventory_stock_movements")
    .insert({
      tenant_id: params.tenantId,
      item_id: params.itemId,
      location_id: params.locationId,
      movement_type: params.movementType,
      qty: params.qty,
      unit_cost_at_movement: params.unitCost ?? 0,
      related_location_id: params.relatedLocationId ?? null,
      reference_type: params.referenceType ?? null,
      reference_id: params.referenceId ?? null,
      reason: params.reason ?? null,
      performed_by: params.performedBy,
      note: params.note ?? null,
    })
    .select("*")
    .single();

  if (error || !movement) {
    return { error: error?.message ?? "Could not record stock movement.", movement: null, qtyOnHand: null };
  }

  const reorderPoint = level ? num(level.reorder_point) : 0;
  if (reorderPoint > 0 && newQty <= reorderPoint) {
    await maybeNotifyLowStock(supabase, params.tenantId, params.itemId, params.locationId, newQty);
  }

  return { error: null, movement, qtyOnHand: newQty };
}

export async function recordWaste(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    itemId: string;
    locationId: string;
    qty: number;
    reason: string;
    performedBy: string;
    note?: string;
  },
) {
  return postStockMovement(supabase, {
    tenantId: params.tenantId,
    itemId: params.itemId,
    locationId: params.locationId,
    movementType: "waste",
    qty: -Math.abs(params.qty),
    reason: params.reason,
    performedBy: params.performedBy,
    note: params.note,
  });
}

export async function upsertParReorder(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    itemId: string;
    locationId: string;
    parLevel: number;
    reorderPoint: number;
    reorderQty: number;
  },
) {
  const { error } = await supabase.schema("hotel").from("inventory_stock_levels").upsert(
    {
      tenant_id: params.tenantId,
      item_id: params.itemId,
      location_id: params.locationId,
      par_level: params.parLevel,
      reorder_point: params.reorderPoint,
      reorder_qty: params.reorderQty,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "item_id,location_id", ignoreDuplicates: false },
  );
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Resolves item name/SKU/unit-cost plus the *display name* of the item's
 * unit of measure (units are a tenant-managed lookup table, not a fixed
 * enum) for a batch of item ids. Shared by every module that needs to show
 * an item on a line (stock levels, movements, requisitions, transfers,
 * receipts, stock counts, F&B recipe ingredients).
 */
export async function resolveInventoryItemDisplay(
  supabase: SupabaseClient,
  tenantId: string,
  itemIds: string[],
): Promise<Map<string, { name: string; sku: string; unit_of_measure: string; unit_cost: number }>> {
  const map = new Map<string, { name: string; sku: string; unit_of_measure: string; unit_cost: number }>();
  const uniqueIds = [...new Set(itemIds)];
  if (!uniqueIds.length) return map;

  const { data } = await supabase
    .schema("hotel")
    .from("inventory_items")
    .select("id,name,sku,unit_of_measure,unit_cost")
    .eq("tenant_id", tenantId)
    .in("id", uniqueIds);
  const rows = data ?? [];

  const unitIds = [...new Set(rows.map((r) => r.unit_of_measure as string))];
  const { data: units } = unitIds.length
    ? await supabase.schema("hotel").from("inventory_units").select("id,name").eq("tenant_id", tenantId).in("id", unitIds)
    : { data: [] };
  const unitNameById = new Map((units ?? []).map((u) => [u.id as string, u.name as string]));

  for (const it of rows) {
    map.set(it.id as string, {
      name: it.name as string,
      sku: it.sku as string,
      unit_of_measure: unitNameById.get(it.unit_of_measure as string) ?? "Unknown unit",
      unit_cost: num(it.unit_cost),
    });
  }
  return map;
}

async function attachItemAndLocationDetails<
  T extends { item_id: string; location_id: string },
>(supabase: SupabaseClient, tenantId: string, rows: T[]) {
  return resolveInventoryItemDisplay(
    supabase,
    tenantId,
    rows.map((r) => r.item_id),
  );
}

async function locationNameMap(supabase: SupabaseClient, tenantId: string, locationIds: string[]) {
  const map = new Map<string, string>();
  const ids = [...new Set(locationIds.filter(Boolean))];
  if (!ids.length) return map;
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_locations")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  for (const l of data ?? []) map.set(l.id as string, l.name as string);
  return map;
}

export async function getStockLevels(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { locationId?: string; itemId?: string; onlyLowStock?: boolean },
): Promise<InventoryStockLevelWithDetails[]> {
  let q = supabase.schema("hotel").from("inventory_stock_levels").select("*").eq("tenant_id", tenantId);
  if (opts?.locationId) q = q.eq("location_id", opts.locationId);
  if (opts?.itemId) q = q.eq("item_id", opts.itemId);

  const { data } = await q;
  let rows = data ?? [];
  if (opts?.onlyLowStock) {
    rows = rows.filter((r) => num(r.qty_on_hand) <= num(r.reorder_point) && num(r.reorder_point) > 0);
  }

  const itemDetails = await attachItemAndLocationDetails(supabase, tenantId, rows as { item_id: string; location_id: string }[]);
  const locationNames = await locationNameMap(supabase, tenantId, rows.map((r) => r.location_id as string));

  return rows.map((r) => {
    const item = itemDetails.get(r.item_id as string);
    return {
      id: r.id as string,
      tenant_id: r.tenant_id as string,
      item_id: r.item_id as string,
      location_id: r.location_id as string,
      qty_on_hand: num(r.qty_on_hand),
      par_level: num(r.par_level),
      reorder_point: num(r.reorder_point),
      reorder_qty: num(r.reorder_qty),
      updated_at: r.updated_at as string,
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? "",
      unit_of_measure: item?.unit_of_measure ?? "—",
      unit_cost: item?.unit_cost ?? 0,
      location_name: locationNames.get(r.location_id as string) ?? "Store",
    };
  });
}

export async function getLowStockLevels(supabase: SupabaseClient, tenantId: string) {
  return getStockLevels(supabase, tenantId, { onlyLowStock: true });
}

export async function getRecentMovements(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { limit?: number; movementType?: InventoryMovementType; locationId?: string },
): Promise<InventoryMovementWithDetails[]> {
  let q = supabase
    .schema("hotel")
    .from("inventory_stock_movements")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.movementType) q = q.eq("movement_type", opts.movementType);
  if (opts?.locationId) q = q.eq("location_id", opts.locationId);

  const { data } = await q;
  const rows = data ?? [];
  const itemDetails = await attachItemAndLocationDetails(supabase, tenantId, rows as { item_id: string; location_id: string }[]);
  const locationNames = await locationNameMap(
    supabase,
    tenantId,
    rows.flatMap((r) => [r.location_id as string, r.related_location_id as string | null].filter(Boolean) as string[]),
  );

  return rows.map((r) => {
    const item = itemDetails.get(r.item_id as string);
    return {
      id: r.id as string,
      tenant_id: r.tenant_id as string,
      item_id: r.item_id as string,
      location_id: r.location_id as string,
      movement_type: r.movement_type as InventoryMovementType,
      qty: num(r.qty),
      unit_cost_at_movement: num(r.unit_cost_at_movement),
      related_location_id: (r.related_location_id as string) ?? null,
      reference_type: (r.reference_type as string) ?? null,
      reference_id: (r.reference_id as string) ?? null,
      reason: (r.reason as string) ?? null,
      performed_by: (r.performed_by as string) ?? null,
      note: (r.note as string) ?? null,
      created_at: r.created_at as string,
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? "",
      unit_of_measure: item?.unit_of_measure ?? "—",
      location_name: locationNames.get(r.location_id as string) ?? "Store",
      related_location_name: r.related_location_id ? (locationNames.get(r.related_location_id as string) ?? null) : null,
    };
  });
}

export type InventoryDashboardStats = {
  skuCount: number;
  stockValue: number;
  lowStockCount: number;
  pendingRequisitions: number;
  todayReceipts: number;
  todayIssues: number;
  todayWaste: number;
};

export async function getInventoryDashboardStats(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<InventoryDashboardStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [{ data: items }, levels, { count: pendingCount }, { data: todayMovements }] = await Promise.all([
    supabase.schema("hotel").from("inventory_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
    getStockLevels(supabase, tenantId),
    supabase
      .schema("hotel")
      .from("inventory_requisitions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "approved", "partially_issued"]),
    supabase
      .schema("hotel")
      .from("inventory_stock_movements")
      .select("movement_type,qty")
      .eq("tenant_id", tenantId)
      .gte("created_at", startOfToday.toISOString()),
  ]);

  const stockValue = levels.reduce((sum, l) => sum + l.qty_on_hand * l.unit_cost, 0);
  const lowStockCount = levels.filter((l) => l.reorder_point > 0 && l.qty_on_hand <= l.reorder_point).length;

  let todayReceipts = 0;
  let todayIssues = 0;
  let todayWaste = 0;
  for (const m of todayMovements ?? []) {
    if (m.movement_type === "receipt") todayReceipts += num(m.qty);
    if (m.movement_type === "issue" || m.movement_type === "transfer_out") todayIssues += Math.abs(num(m.qty));
    if (m.movement_type === "waste") todayWaste += Math.abs(num(m.qty));
  }

  return {
    skuCount: (items as unknown as { length: number } | null)?.length ?? 0,
    stockValue: Math.round(stockValue * 100) / 100,
    lowStockCount,
    pendingRequisitions: pendingCount ?? 0,
    todayReceipts,
    todayIssues,
    todayWaste,
  };
}

export type ReorderSuggestion = {
  itemId: string;
  itemName: string;
  itemSku: string;
  locationId: string;
  locationName: string;
  qtyOnHand: number;
  reorderPoint: number;
  suggestedQty: number;
  unitOfMeasure: string;
};

/** Data seam for a future Procurement module — items at/under reorder point. */
export async function getReorderSuggestions(supabase: SupabaseClient, tenantId: string): Promise<ReorderSuggestion[]> {
  const low = await getLowStockLevels(supabase, tenantId);
  return low.map((l) => ({
    itemId: l.item_id,
    itemName: l.item_name,
    itemSku: l.item_sku,
    locationId: l.location_id,
    locationName: l.location_name,
    qtyOnHand: l.qty_on_hand,
    reorderPoint: l.reorder_point,
    suggestedQty: l.reorder_qty > 0 ? l.reorder_qty : Math.max(l.par_level - l.qty_on_hand, 0),
    unitOfMeasure: l.unit_of_measure,
  }));
}
