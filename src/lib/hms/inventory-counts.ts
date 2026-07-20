import type { SupabaseClient } from "@supabase/supabase-js";
import { postStockMovement, resolveInventoryItemDisplay } from "@/lib/hms/inventory-stock";
import type {
  InventoryStockCountRow,
  InventoryStockCountStatus,
  InventoryStockCountWithLines,
} from "@/lib/hms/inventory-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function mapCount(r: Record<string, unknown>): InventoryStockCountRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    location_id: r.location_id as string,
    count_date: r.count_date as string,
    status: r.status as InventoryStockCountStatus,
    started_by: (r.started_by as string) ?? null,
    posted_by: (r.posted_by as string) ?? null,
    posted_at: (r.posted_at as string) ?? null,
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

async function attachLinesAndLocation(
  supabase: SupabaseClient,
  tenantId: string,
  counts: InventoryStockCountRow[],
): Promise<InventoryStockCountWithLines[]> {
  if (!counts.length) return [];
  const countIds = counts.map((c) => c.id);
  const locationIds = [...new Set(counts.map((c) => c.location_id))];

  const [{ data: lines }, { data: locations }] = await Promise.all([
    supabase.schema("hotel").from("inventory_stock_count_lines").select("*").in("count_id", countIds),
    supabase.schema("hotel").from("inventory_locations").select("id,name").eq("tenant_id", tenantId).in("id", locationIds),
  ]);

  const itemIds = [...new Set((lines ?? []).map((l) => l.item_id as string))];
  const itemById = await resolveInventoryItemDisplay(supabase, tenantId, itemIds);
  const locationById = new Map((locations ?? []).map((l) => [l.id as string, l.name as string]));
  const linesByCount = new Map<string, InventoryStockCountWithLines["lines"]>();
  for (const l of lines ?? []) {
    const item = itemById.get(l.item_id as string);
    const countedQty = l.counted_qty == null ? null : num(l.counted_qty);
    const list = linesByCount.get(l.count_id as string) ?? [];
    list.push({
      id: l.id as string,
      tenant_id: l.tenant_id as string,
      count_id: l.count_id as string,
      item_id: l.item_id as string,
      system_qty: num(l.system_qty),
      counted_qty: countedQty,
      created_at: l.created_at as string,
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? "",
      unit_of_measure: item?.unit_of_measure ?? "—",
      variance: countedQty == null ? null : Math.round((countedQty - num(l.system_qty)) * 1000) / 1000,
    });
    linesByCount.set(l.count_id as string, list);
  }

  return counts.map((c) => ({
    ...c,
    location_name: locationById.get(c.location_id) ?? "Store",
    lines: linesByCount.get(c.id) ?? [],
  }));
}

export async function listStockCounts(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { status?: InventoryStockCountStatus[]; limit?: number },
) {
  let q = supabase
    .schema("hotel")
    .from("inventory_stock_counts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.status?.length) q = q.in("status", opts.status);

  const { data } = await q;
  const counts = (data ?? []).map((r) => mapCount(r as Record<string, unknown>));
  return attachLinesAndLocation(supabase, tenantId, counts);
}

export async function getStockCountById(supabase: SupabaseClient, tenantId: string, countId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_stock_counts")
    .select("*")
    .eq("id", countId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const [full] = await attachLinesAndLocation(supabase, tenantId, [mapCount(data as Record<string, unknown>)]);
  return full ?? null;
}

/** Opens a new count and snapshots each active item's current balance at that location as system_qty. */
export async function createStockCount(
  supabase: SupabaseClient,
  params: { tenantId: string; locationId: string; startedBy: string; notes?: string },
) {
  const { data: count, error } = await supabase
    .schema("hotel")
    .from("inventory_stock_counts")
    .insert({
      tenant_id: params.tenantId,
      location_id: params.locationId,
      started_by: params.startedBy,
      notes: params.notes?.trim() || null,
      status: "in_progress",
    })
    .select("*")
    .single();
  if (error || !count) return { count: null, error: error?.message ?? "Could not open stock count." };

  const { data: levels } = await supabase
    .schema("hotel")
    .from("inventory_stock_levels")
    .select("item_id,qty_on_hand")
    .eq("tenant_id", params.tenantId)
    .eq("location_id", params.locationId);

  if (levels?.length) {
    const { error: linesError } = await supabase.schema("hotel").from("inventory_stock_count_lines").insert(
      levels.map((l) => ({
        tenant_id: params.tenantId,
        count_id: count.id,
        item_id: l.item_id,
        system_qty: l.qty_on_hand,
      })),
    );
    if (linesError) return { count: null, error: linesError.message };
  }

  const full = await getStockCountById(supabase, params.tenantId, count.id as string);
  return { count: full, error: null };
}

export async function updateCountLine(
  supabase: SupabaseClient,
  tenantId: string,
  countId: string,
  lineId: string,
  countedQty: number,
) {
  const { data: count } = await supabase
    .schema("hotel")
    .from("inventory_stock_counts")
    .select("status")
    .eq("id", countId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!count || !["in_progress", "draft"].includes(count.status as string)) {
    return { error: "This count can no longer be edited." };
  }

  const { error } = await supabase
    .schema("hotel")
    .from("inventory_stock_count_lines")
    .update({ counted_qty: countedQty })
    .eq("id", lineId)
    .eq("count_id", countId);
  if (error) return { error: error.message };
  return { error: null };
}

/** Posts count_variance movements for every counted line whose tally differs from the system snapshot. */
export async function postStockCount(supabase: SupabaseClient, tenantId: string, countId: string, postedBy: string) {
  const stockCount = await getStockCountById(supabase, tenantId, countId);
  if (!stockCount) return { error: "Stock count not found." };
  if (stockCount.status === "posted") return { error: "This count has already been posted." };

  for (const line of stockCount.lines) {
    if (line.counted_qty == null) continue;
    const variance = Math.round((line.counted_qty - line.system_qty) * 1000) / 1000;
    if (variance === 0) continue;

    const result = await postStockMovement(supabase, {
      tenantId,
      itemId: line.item_id,
      locationId: stockCount.location_id,
      movementType: "count_variance",
      qty: variance,
      referenceType: "stock_count",
      referenceId: countId,
      performedBy: postedBy,
      note: `Physical count: ${line.counted_qty} vs system ${line.system_qty}`,
    });
    if (result.error) return { error: result.error };
  }

  await supabase
    .schema("hotel")
    .from("inventory_stock_counts")
    .update({ status: "posted", posted_by: postedBy, posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", countId)
    .eq("tenant_id", tenantId);

  return { error: null };
}

export async function completeStockCount(supabase: SupabaseClient, tenantId: string, countId: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_stock_counts")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", countId)
    .eq("tenant_id", tenantId)
    .eq("status", "in_progress")
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not complete count." };
  return { error: null };
}
