import type { SupabaseClient } from "@supabase/supabase-js";
import { findFixedAssetItem, postStockMovement, resolveInventoryItemDisplay } from "@/lib/hms/inventory-stock";
import type {
  InventoryTransferRow,
  InventoryTransferStatus,
  InventoryTransferWithLines,
} from "@/lib/hms/inventory-types";

function transferNumber() {
  return `TRF-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function mapTransfer(r: Record<string, unknown>): InventoryTransferRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    transfer_number: r.transfer_number as string,
    from_location_id: r.from_location_id as string,
    to_location_id: r.to_location_id as string,
    status: r.status as InventoryTransferStatus,
    initiated_by: r.initiated_by as string,
    received_by: (r.received_by as string) ?? null,
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

async function attachLinesAndLocations(
  supabase: SupabaseClient,
  tenantId: string,
  transfers: InventoryTransferRow[],
): Promise<InventoryTransferWithLines[]> {
  if (!transfers.length) return [];
  const transferIds = transfers.map((t) => t.id);
  const locationIds = [...new Set(transfers.flatMap((t) => [t.from_location_id, t.to_location_id]))];

  const [{ data: lines }, { data: locations }] = await Promise.all([
    supabase.schema("hotel").from("inventory_transfer_lines").select("*").in("transfer_id", transferIds),
    supabase.schema("hotel").from("inventory_locations").select("id,name").eq("tenant_id", tenantId).in("id", locationIds),
  ]);

  const itemIds = [...new Set((lines ?? []).map((l) => l.item_id as string))];
  const itemById = await resolveInventoryItemDisplay(supabase, tenantId, itemIds);
  const locationById = new Map((locations ?? []).map((l) => [l.id as string, l.name as string]));
  const linesByTransfer = new Map<string, InventoryTransferWithLines["lines"]>();
  for (const l of lines ?? []) {
    const item = itemById.get(l.item_id as string);
    const list = linesByTransfer.get(l.transfer_id as string) ?? [];
    list.push({
      id: l.id as string,
      tenant_id: l.tenant_id as string,
      transfer_id: l.transfer_id as string,
      item_id: l.item_id as string,
      qty: num(l.qty),
      created_at: l.created_at as string,
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? "",
      unit_of_measure: item?.unit_of_measure ?? "—",
    });
    linesByTransfer.set(l.transfer_id as string, list);
  }

  return transfers.map((t) => ({
    ...t,
    from_location_name: locationById.get(t.from_location_id) ?? "Store",
    to_location_name: locationById.get(t.to_location_id) ?? "Store",
    lines: linesByTransfer.get(t.id) ?? [],
  }));
}

export async function listTransfers(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { status?: InventoryTransferStatus[]; limit?: number },
) {
  let q = supabase
    .schema("hotel")
    .from("inventory_transfers")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.status?.length) q = q.in("status", opts.status);

  const { data } = await q;
  const transfers = (data ?? []).map((r) => mapTransfer(r as Record<string, unknown>));
  return attachLinesAndLocations(supabase, tenantId, transfers);
}

export async function getTransferById(supabase: SupabaseClient, tenantId: string, transferId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_transfers")
    .select("*")
    .eq("id", transferId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const [full] = await attachLinesAndLocations(supabase, tenantId, [mapTransfer(data as Record<string, unknown>)]);
  return full ?? null;
}

/**
 * Creates the transfer and immediately deducts stock at the source location
 * (goods leave the source store right away). Destination stock is only
 * credited once `receiveTransfer` confirms arrival.
 */
export async function createTransfer(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    fromLocationId: string;
    toLocationId: string;
    initiatedBy: string;
    notes?: string;
    lines: { itemId: string; qty: number }[];
  },
) {
  if (!params.lines.length) return { transfer: null, error: "Add at least one item." };
  if (params.fromLocationId === params.toLocationId) {
    return { transfer: null, error: "Source and destination locations must differ." };
  }

  const fixedAssetName = await findFixedAssetItem(supabase, params.tenantId, params.lines.map((l) => l.itemId));
  if (fixedAssetName) {
    return { transfer: null, error: `${fixedAssetName} is a fixed asset — record it on your asset register, not through transfers.` };
  }

  const { data: transfer, error } = await supabase
    .schema("hotel")
    .from("inventory_transfers")
    .insert({
      tenant_id: params.tenantId,
      transfer_number: transferNumber(),
      from_location_id: params.fromLocationId,
      to_location_id: params.toLocationId,
      initiated_by: params.initiatedBy,
      notes: params.notes?.trim() || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !transfer) return { transfer: null, error: error?.message ?? "Could not create transfer." };

  const { error: linesError } = await supabase.schema("hotel").from("inventory_transfer_lines").insert(
    params.lines.map((l) => ({
      tenant_id: params.tenantId,
      transfer_id: transfer.id,
      item_id: l.itemId,
      qty: l.qty,
    })),
  );
  if (linesError) return { transfer: null, error: linesError.message };

  for (const line of params.lines) {
    const result = await postStockMovement(supabase, {
      tenantId: params.tenantId,
      itemId: line.itemId,
      locationId: params.fromLocationId,
      movementType: "transfer_out",
      qty: -line.qty,
      relatedLocationId: params.toLocationId,
      referenceType: "transfer",
      referenceId: transfer.id as string,
      performedBy: params.initiatedBy,
    });
    if (result.error) {
      return { transfer: null, error: `${line.itemId}: ${result.error}` };
    }
  }

  await supabase
    .schema("hotel")
    .from("inventory_transfers")
    .update({ status: "in_transit", updated_at: new Date().toISOString() })
    .eq("id", transfer.id);

  const full = await getTransferById(supabase, params.tenantId, transfer.id as string);
  return { transfer: full, error: null };
}

export async function receiveTransfer(
  supabase: SupabaseClient,
  tenantId: string,
  transferId: string,
  receivedBy: string,
) {
  const transfer = await getTransferById(supabase, tenantId, transferId);
  if (!transfer) return { error: "Transfer not found." };
  if (transfer.status !== "in_transit") return { error: "Transfer is not in transit." };

  for (const line of transfer.lines) {
    const result = await postStockMovement(supabase, {
      tenantId,
      itemId: line.item_id,
      locationId: transfer.to_location_id,
      movementType: "transfer_in",
      qty: line.qty,
      relatedLocationId: transfer.from_location_id,
      referenceType: "transfer",
      referenceId: transferId,
      performedBy: receivedBy,
    });
    if (result.error) return { error: result.error };
  }

  await supabase
    .schema("hotel")
    .from("inventory_transfers")
    .update({ status: "completed", received_by: receivedBy, updated_at: new Date().toISOString() })
    .eq("id", transferId)
    .eq("tenant_id", tenantId);

  return { error: null };
}

export async function cancelTransfer(supabase: SupabaseClient, tenantId: string, transferId: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_transfers")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", transferId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Only a pending transfer can be cancelled." };
  return { error: null };
}
