import type { SupabaseClient } from "@supabase/supabase-js";
import { postStockMovement } from "@/lib/hms/inventory-stock";
import { createRequisition } from "@/lib/hms/inventory-requisitions";

/** Item categories Housekeeping cares about — linen, guest amenities, cleaning consumables. */
const HOUSEKEEPING_ITEM_TYPE_CODES = ["linen", "amenity", "consumable"] as const;

export type HousekeepingEligibleItem = {
  id: string;
  name: string;
  sku: string;
  unitOfMeasureName: string;
  itemTypeName: string;
};

/**
 * Items Housekeeping can set a room-type par against — Inventory's existing catalog,
 * filtered to linen/amenity/consumable types. No separate Housekeeping item list.
 */
export async function listHousekeepingEligibleItems(
  service: SupabaseClient,
  tenantId: string,
): Promise<HousekeepingEligibleItem[]> {
  const { data: types } = await service
    .schema("hotel")
    .from("inventory_item_types")
    .select("id,name,code")
    .eq("tenant_id", tenantId)
    .in("code", HOUSEKEEPING_ITEM_TYPE_CODES as unknown as string[]);

  const typeIds = (types ?? []).map((t) => t.id as string);
  if (typeIds.length === 0) return [];

  const { data: items } = await service
    .schema("hotel")
    .from("inventory_items")
    .select("id,name,sku,unit_of_measure,item_type")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("item_type", typeIds)
    .order("name", { ascending: true });

  const rows = (items ?? []) as { id: string; name: string; sku: string; unit_of_measure: string; item_type: string }[];
  if (rows.length === 0) return [];

  const unitIds = [...new Set(rows.map((r) => r.unit_of_measure))];
  const { data: units } = await service
    .schema("hotel")
    .from("inventory_units")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .in("id", unitIds);

  const typeNameById = new Map((types ?? []).map((t) => [t.id as string, t.name as string]));
  const unitNameById = new Map((units ?? []).map((u) => [u.id as string, u.name as string]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    unitOfMeasureName: unitNameById.get(r.unit_of_measure) ?? "unit",
    itemTypeName: typeNameById.get(r.item_type) ?? "Other",
  }));
}

/**
 * The store Housekeeping consumption/requisitions draw from. Prefers a location explicitly
 * typed `housekeeping_store`; falls back to any active location so the feature still works
 * for properties that haven't set up a dedicated store yet.
 */
export async function getHousekeepingStoreLocationId(
  service: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data: type } = await service
    .schema("hotel")
    .from("inventory_location_types")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", "housekeeping_store")
    .maybeSingle();

  if (type) {
    const { data: location } = await service
      .schema("hotel")
      .from("inventory_locations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("location_type", type.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (location) return location.id as string;
  }

  const { data: fallback } = await service
    .schema("hotel")
    .from("inventory_locations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return (fallback?.id as string) ?? null;
}

export type RoomTypePar = {
  id: string;
  roomTypeCode: string;
  itemId: string;
  itemName: string;
  parQty: number;
};

export async function listRoomTypePars(service: SupabaseClient, tenantId: string): Promise<RoomTypePar[]> {
  const { data } = await service
    .schema("hotel")
    .from("housekeeping_room_type_pars")
    .select("id,room_type_code,item_id,par_qty")
    .eq("tenant_id", tenantId)
    .order("room_type_code", { ascending: true });

  const rows = (data ?? []) as { id: string; room_type_code: string; item_id: string; par_qty: number }[];
  if (rows.length === 0) return [];

  const itemIds = [...new Set(rows.map((r) => r.item_id))];
  const { data: items } = await service
    .schema("hotel")
    .from("inventory_items")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .in("id", itemIds);
  const nameById = new Map((items ?? []).map((i) => [i.id as string, i.name as string]));

  return rows.map((r) => ({
    id: r.id,
    roomTypeCode: r.room_type_code,
    itemId: r.item_id,
    itemName: nameById.get(r.item_id) ?? "Item",
    parQty: Number(r.par_qty),
  }));
}

export async function getRoomTypeParsForRoomType(
  service: SupabaseClient,
  tenantId: string,
  roomTypeCode: string,
): Promise<RoomTypePar[]> {
  const all = await listRoomTypePars(service, tenantId);
  return all.filter((p) => p.roomTypeCode === roomTypeCode);
}

export async function upsertRoomTypePar(
  service: SupabaseClient,
  params: { tenantId: string; roomTypeCode: string; itemId: string; parQty: number },
) {
  const { error } = await service
    .schema("hotel")
    .from("housekeeping_room_type_pars")
    .upsert(
      {
        tenant_id: params.tenantId,
        room_type_code: params.roomTypeCode,
        item_id: params.itemId,
        par_qty: params.parQty,
      },
      { onConflict: "tenant_id,room_type_code,item_id" },
    );
  if (error) throw new Error(error.message);
}

export async function deleteRoomTypePar(service: SupabaseClient, params: { tenantId: string; id: string }) {
  const { error } = await service
    .schema("hotel")
    .from("housekeeping_room_type_pars")
    .delete()
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id);
  if (error) throw new Error(error.message);
}

/**
 * Posts par-based consumption to Inventory's real stock ledger on task completion (HK-25).
 * Housekeeping never maintains its own stock number — this is the only writer, and it is
 * `postStockMovement`, the same single entry point every other module uses. Best-effort per
 * line: a stock error (e.g. insufficient quantity) does not block the room from being marked
 * cleaned — the room was physically cleaned regardless of what the ledger says.
 */
export async function postHousekeepingConsumption(
  service: SupabaseClient,
  params: {
    tenantId: string;
    taskId: string;
    performedBy: string;
    lines: { itemId: string; qty: number }[];
  },
): Promise<{ posted: number; errors: string[] }> {
  if (params.lines.length === 0) return { posted: 0, errors: [] };

  const locationId = await getHousekeepingStoreLocationId(service, params.tenantId);
  if (!locationId) {
    return { posted: 0, errors: ["No store location configured to issue supplies from."] };
  }

  let posted = 0;
  const errors: string[] = [];
  for (const line of params.lines) {
    if (line.qty <= 0) continue;
    const result = await postStockMovement(service, {
      tenantId: params.tenantId,
      itemId: line.itemId,
      locationId,
      movementType: "issue",
      qty: -Math.abs(line.qty),
      referenceType: "housekeeping_task",
      referenceId: params.taskId,
      performedBy: params.performedBy,
      reason: "Housekeeping room turnover",
    });
    if (result.error) errors.push(result.error);
    else posted += 1;
  }

  return { posted, errors };
}

/**
 * Missing-supply flag (HK-26): an ordinary internal stock requisition against Inventory,
 * fulfilled from on-hand stock — the exact same `inventory_requisitions` mechanism every
 * other department uses. Distinct from Procurement's PC-06 external-sourcing gate (§9/HK-27
 * of the Housekeeping PRD) — that gate applies when Inventory/Admin escalate an approved
 * requisition to Procurement, not at the point a department raises one.
 */
export async function createHousekeepingSupplyRequisition(
  service: SupabaseClient,
  params: {
    tenantId: string;
    requestedBy: string;
    notes?: string;
    lines: { itemId: string; qty: number }[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const lines = params.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) return { ok: false, error: "No items to request." };

  const locationId = await getHousekeepingStoreLocationId(service, params.tenantId);
  if (!locationId) return { ok: false, error: "No store location configured to request from." };

  const { error } = await createRequisition(service, {
    tenantId: params.tenantId,
    requestingDepartment: "Housekeeping",
    fromLocationId: locationId,
    requestedBy: params.requestedBy,
    notes: params.notes,
    lines,
  });

  if (error) return { ok: false, error };
  return { ok: true };
}
