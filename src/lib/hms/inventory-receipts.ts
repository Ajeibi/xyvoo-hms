import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findFixedAssetItem,
  postStockMovement,
  recalculateWeightedAverageCost,
  resolveInventoryItemDisplay,
} from "@/lib/hms/inventory-stock";
import type { InventoryReceiptRow, InventoryReceiptWithLines } from "@/lib/hms/inventory-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function receiptNumber() {
  return `GRN-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function mapReceipt(r: Record<string, unknown>): InventoryReceiptRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    receipt_number: r.receipt_number as string,
    location_id: r.location_id as string,
    supplier_id: (r.supplier_id as string) ?? null,
    supplier_name: (r.supplier_name as string) ?? null,
    procurement_reference: (r.procurement_reference as string) ?? null,
    received_by: r.received_by as string,
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
  };
}

async function attachLinesAndLocation(
  supabase: SupabaseClient,
  tenantId: string,
  receipts: InventoryReceiptRow[],
): Promise<InventoryReceiptWithLines[]> {
  if (!receipts.length) return [];
  const receiptIds = receipts.map((r) => r.id);
  const locationIds = [...new Set(receipts.map((r) => r.location_id))];

  const [{ data: lines }, { data: locations }] = await Promise.all([
    supabase.schema("hotel").from("inventory_receipt_lines").select("*").in("receipt_id", receiptIds),
    supabase.schema("hotel").from("inventory_locations").select("id,name").eq("tenant_id", tenantId).in("id", locationIds),
  ]);

  const itemIds = [...new Set((lines ?? []).map((l) => l.item_id as string))];
  const itemById = await resolveInventoryItemDisplay(supabase, tenantId, itemIds);
  const locationById = new Map((locations ?? []).map((l) => [l.id as string, l.name as string]));
  const linesByReceipt = new Map<string, InventoryReceiptWithLines["lines"]>();
  for (const l of lines ?? []) {
    const item = itemById.get(l.item_id as string);
    const list = linesByReceipt.get(l.receipt_id as string) ?? [];
    list.push({
      id: l.id as string,
      tenant_id: l.tenant_id as string,
      receipt_id: l.receipt_id as string,
      item_id: l.item_id as string,
      qty_received: num(l.qty_received),
      unit_cost: num(l.unit_cost),
      created_at: l.created_at as string,
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? "",
      unit_of_measure: item?.unit_of_measure ?? "—",
    });
    linesByReceipt.set(l.receipt_id as string, list);
  }

  return receipts.map((r) => ({
    ...r,
    location_name: locationById.get(r.location_id) ?? "Store",
    lines: linesByReceipt.get(r.id) ?? [],
  }));
}

export async function listReceipts(supabase: SupabaseClient, tenantId: string, opts?: { limit?: number }) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_receipts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  const receipts = (data ?? []).map((r) => mapReceipt(r as Record<string, unknown>));
  return attachLinesAndLocation(supabase, tenantId, receipts);
}

export async function getReceiptById(supabase: SupabaseClient, tenantId: string, receiptId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_receipts")
    .select("*")
    .eq("id", receiptId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const [full] = await attachLinesAndLocation(supabase, tenantId, [mapReceipt(data as Record<string, unknown>)]);
  return full ?? null;
}

/** Creates a goods receipt and immediately posts a `receipt` movement (stock in) per line. */
export async function createReceipt(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    locationId: string;
    supplierId?: string;
    supplierName?: string;
    procurementReference?: string;
    receivedBy: string;
    notes?: string;
    lines: { itemId: string; qtyReceived: number; unitCost: number }[];
  },
) {
  if (!params.lines.length) return { receipt: null, error: "Add at least one item." };

  const fixedAssetName = await findFixedAssetItem(supabase, params.tenantId, params.lines.map((l) => l.itemId));
  if (fixedAssetName) {
    return { receipt: null, error: `${fixedAssetName} is a fixed asset — record it on your asset register, not through receiving.` };
  }

  // A registered supplier's name takes precedence over free text, so the
  // receipt always shows a consistent name for a given supplier record.
  let supplierName = params.supplierName?.trim() || null;
  if (params.supplierId) {
    const { data: supplier } = await supabase
      .schema("hotel")
      .from("inventory_suppliers")
      .select("name")
      .eq("id", params.supplierId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();
    if (supplier?.name) supplierName = supplier.name as string;
  }

  const { data: receipt, error } = await supabase
    .schema("hotel")
    .from("inventory_receipts")
    .insert({
      tenant_id: params.tenantId,
      receipt_number: receiptNumber(),
      location_id: params.locationId,
      supplier_id: params.supplierId ?? null,
      supplier_name: supplierName,
      procurement_reference: params.procurementReference?.trim() || null,
      received_by: params.receivedBy,
      notes: params.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !receipt) return { receipt: null, error: error?.message ?? "Could not create receipt." };

  const { error: linesError } = await supabase.schema("hotel").from("inventory_receipt_lines").insert(
    params.lines.map((l) => ({
      tenant_id: params.tenantId,
      receipt_id: receipt.id,
      item_id: l.itemId,
      qty_received: l.qtyReceived,
      unit_cost: l.unitCost,
    })),
  );
  if (linesError) return { receipt: null, error: linesError.message };

  for (const line of params.lines) {
    // Blend this line's price into the item's weighted-average cost before the
    // movement changes qty_on_hand — the calculation needs the pre-receipt quantity.
    if (line.unitCost > 0) {
      await recalculateWeightedAverageCost(supabase, params.tenantId, line.itemId, line.qtyReceived, line.unitCost);
    }

    const result = await postStockMovement(supabase, {
      tenantId: params.tenantId,
      itemId: line.itemId,
      locationId: params.locationId,
      movementType: "receipt",
      qty: line.qtyReceived,
      unitCost: line.unitCost,
      referenceType: "receipt",
      referenceId: receipt.id as string,
      performedBy: params.receivedBy,
    });
    if (result.error) return { receipt: null, error: `${line.itemId}: ${result.error}` };
  }

  const full = await getReceiptById(supabase, params.tenantId, receipt.id as string);
  return { receipt: full, error: null };
}
