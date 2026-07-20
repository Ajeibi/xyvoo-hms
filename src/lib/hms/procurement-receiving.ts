import type { SupabaseClient } from "@supabase/supabase-js";
import { postStockMovement, resolveInventoryItemDisplay } from "@/lib/hms/inventory-stock";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { notifyGoodsReceivedDiscrepancy } from "@/lib/hms/notification-rules";
import { listPurchaseOrders } from "@/lib/hms/procurement-orders";
import type { PurchaseOrderStatus, ProcurementReceiptLineInput, DiscrepancyType } from "@/lib/hms/procurement-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function receiptNumber() {
  return `GRN-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export type ProcurementReceiptLine = {
  id: string;
  receiptId: string;
  purchaseOrderLineId: string | null;
  itemId: string;
  itemName: string;
  itemSku: string;
  unitOfMeasure: string;
  qtyReceived: number;
  qtyRejected: number;
  qtyAccepted: number;
  unitCost: number;
  discrepancyType: DiscrepancyType;
  qualityPassed: boolean;
  qualityNotes: string | null;
};

export type ProcurementReceipt = {
  id: string;
  receiptNumber: string;
  locationId: string;
  locationName: string;
  vendorId: string | null;
  vendorName: string | null;
  purchaseOrderId: string | null;
  poNumber: string | null;
  receivedBy: string;
  notes: string | null;
  createdAt: string;
  lines: ProcurementReceiptLine[];
  hasDiscrepancy: boolean;
};

/** Purchase orders that have been sent to the vendor and are due (or partially due) for delivery, with lines for the receiving form. */
export async function listPurchaseOrdersAwaitingReceipt(supabase: SupabaseClient, tenantId: string) {
  return listPurchaseOrders(supabase, tenantId, { status: ["ordered", "partially_received"], limit: 200 });
}

async function mapReceiptsWithLines(
  supabase: SupabaseClient,
  tenantId: string,
  receiptRows: Record<string, unknown>[],
): Promise<ProcurementReceipt[]> {
  if (!receiptRows.length) return [];
  const receiptIds = receiptRows.map((r) => r.id as string);
  const locationIds = [...new Set(receiptRows.map((r) => r.location_id as string))];
  const vendorIds = [...new Set(receiptRows.map((r) => r.vendor_id as string).filter(Boolean))];
  const poIds = [...new Set(receiptRows.map((r) => r.purchase_order_id as string).filter(Boolean))];

  const [{ data: lines }, { data: locations }, { data: vendors }, { data: pos }] = await Promise.all([
    supabase.schema("hotel").from("inventory_receipt_lines").select("*").in("receipt_id", receiptIds),
    supabase.schema("hotel").from("inventory_locations").select("id,name").eq("tenant_id", tenantId).in("id", locationIds),
    vendorIds.length ? supabase.schema("hotel").from("vendors").select("id,name").in("id", vendorIds) : Promise.resolve({ data: [] }),
    poIds.length ? supabase.schema("hotel").from("purchase_orders").select("id,po_number").in("id", poIds) : Promise.resolve({ data: [] }),
  ]);

  const itemIds = [...new Set((lines ?? []).map((l) => l.item_id as string))];
  const itemDetails = await resolveInventoryItemDisplay(supabase, tenantId, itemIds);
  const locationNameById = new Map((locations ?? []).map((l) => [l.id as string, l.name as string]));
  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id as string, v.name as string]));
  const poNumberById = new Map((pos ?? []).map((p) => [p.id as string, p.po_number as string]));

  const linesByReceipt = new Map<string, ProcurementReceiptLine[]>();
  for (const l of lines ?? []) {
    const item = itemDetails.get(l.item_id as string);
    const qtyReceived = num(l.qty_received);
    const qtyRejected = num(l.qty_rejected);
    const list = linesByReceipt.get(l.receipt_id as string) ?? [];
    list.push({
      id: l.id as string,
      receiptId: l.receipt_id as string,
      purchaseOrderLineId: (l.purchase_order_line_id as string) ?? null,
      itemId: l.item_id as string,
      itemName: item?.name ?? "Unknown item",
      itemSku: item?.sku ?? "",
      unitOfMeasure: item?.unit_of_measure ?? "—",
      qtyReceived,
      qtyRejected,
      qtyAccepted: Math.max(qtyReceived - qtyRejected, 0),
      unitCost: num(l.unit_cost),
      discrepancyType: (l.discrepancy_type as DiscrepancyType) ?? "none",
      qualityPassed: l.quality_passed !== false,
      qualityNotes: (l.quality_notes as string) ?? null,
    });
    linesByReceipt.set(l.receipt_id as string, list);
  }

  return receiptRows.map((r) => {
    const receiptLines = linesByReceipt.get(r.id as string) ?? [];
    return {
      id: r.id as string,
      receiptNumber: r.receipt_number as string,
      locationId: r.location_id as string,
      locationName: locationNameById.get(r.location_id as string) ?? "Store",
      vendorId: (r.vendor_id as string) ?? null,
      vendorName: r.vendor_id ? vendorNameById.get(r.vendor_id as string) ?? null : null,
      purchaseOrderId: (r.purchase_order_id as string) ?? null,
      poNumber: r.purchase_order_id ? poNumberById.get(r.purchase_order_id as string) ?? null : null,
      receivedBy: r.received_by as string,
      notes: (r.notes as string) ?? null,
      createdAt: r.created_at as string,
      lines: receiptLines,
      hasDiscrepancy: receiptLines.some((l) => l.discrepancyType !== "none" || !l.qualityPassed),
    };
  });
}

export async function listProcurementReceipts(supabase: SupabaseClient, tenantId: string, opts?: { limit?: number }) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_receipts")
    .select("*")
    .eq("tenant_id", tenantId)
    .not("purchase_order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  return mapReceiptsWithLines(supabase, tenantId, (data ?? []) as Record<string, unknown>[]);
}

async function refreshPurchaseOrderStatus(supabase: SupabaseClient, tenantId: string, poId: string) {
  const { data: lines } = await supabase.schema("hotel").from("purchase_order_lines").select("quantity,quantity_received").eq("po_id", poId);
  const allLines = lines ?? [];
  if (!allLines.length) return;

  const fullyReceived = allLines.every((l) => num(l.quantity_received) >= num(l.quantity));
  const anyReceived = allLines.some((l) => num(l.quantity_received) > 0);
  const nextStatus: PurchaseOrderStatus = fullyReceived ? "received" : anyReceived ? "partially_received" : "ordered";

  await supabase
    .schema("hotel")
    .from("purchase_orders")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", poId)
    .eq("tenant_id", tenantId)
    .in("status", ["ordered", "partially_received"]);
}

/**
 * Records a Goods Receiving Note against a purchase order: creates the
 * receipt + lines (reusing hotel.inventory_receipts, extended with vendor/PO
 * linkage and QC outcome), posts accepted quantities to the Inventory stock
 * ledger, and leaves rejected/failed quantities out of stock entirely.
 */
export async function receiveAgainstPurchaseOrder(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    poId: string;
    locationId: string;
    receivedBy: string;
    notes?: string;
    lines: ProcurementReceiptLineInput[];
  },
) {
  if (!params.lines.length) return { receipt: null, error: "Add at least one item received." };

  const { data: po } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .select("id,po_number,vendor_id,status")
    .eq("id", params.poId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  if (!po) return { receipt: null, error: "Purchase order not found." };
  if (!["ordered", "partially_received"].includes(po.status as string)) {
    return { receipt: null, error: "Purchase order must be marked as ordered before receiving goods." };
  }

  const { data: vendor } = await supabase.schema("hotel").from("vendors").select("name").eq("id", po.vendor_id).maybeSingle();

  const { data: receipt, error } = await supabase
    .schema("hotel")
    .from("inventory_receipts")
    .insert({
      tenant_id: params.tenantId,
      receipt_number: receiptNumber(),
      location_id: params.locationId,
      vendor_id: po.vendor_id,
      purchase_order_id: params.poId,
      supplier_name: (vendor?.name as string) ?? null,
      procurement_reference: po.po_number as string,
      received_by: params.receivedBy,
      notes: params.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (error || !receipt) return { receipt: null, error: error?.message ?? "Could not create receiving note." };

  const { error: linesError } = await supabase.schema("hotel").from("inventory_receipt_lines").insert(
    params.lines.map((l) => ({
      tenant_id: params.tenantId,
      receipt_id: receipt.id,
      purchase_order_line_id: l.purchaseOrderLineId,
      item_id: l.itemId,
      qty_received: l.qtyReceived,
      unit_cost: l.unitCost,
      qty_rejected: l.qtyRejected,
      discrepancy_type: l.discrepancyType,
      quality_passed: l.qualityPassed,
      quality_notes: l.qualityNotes?.trim() || null,
    })),
  );
  if (linesError) return { receipt: null, error: linesError.message };

  let anyDiscrepancy = false;
  for (const line of params.lines) {
    const qtyAccepted = Math.max(line.qtyReceived - line.qtyRejected, 0);
    if (line.discrepancyType !== "none" || !line.qualityPassed) anyDiscrepancy = true;

    if (qtyAccepted > 0) {
      const result = await postStockMovement(supabase, {
        tenantId: params.tenantId,
        itemId: line.itemId,
        locationId: params.locationId,
        movementType: "receipt",
        qty: qtyAccepted,
        unitCost: line.unitCost,
        referenceType: "purchase_order",
        referenceId: params.poId,
        performedBy: params.receivedBy,
      });
      if (result.error) return { receipt: null, error: `${line.itemId}: ${result.error}` };

      if (line.unitCost > 0) {
        await supabase
          .schema("hotel")
          .from("inventory_items")
          .update({ unit_cost: line.unitCost, updated_at: new Date().toISOString() })
          .eq("id", line.itemId)
          .eq("tenant_id", params.tenantId);
      }
    }

    if (line.purchaseOrderLineId) {
      const { data: poLine } = await supabase
        .schema("hotel")
        .from("purchase_order_lines")
        .select("quantity_received")
        .eq("id", line.purchaseOrderLineId)
        .maybeSingle();
      await supabase
        .schema("hotel")
        .from("purchase_order_lines")
        .update({ quantity_received: num(poLine?.quantity_received) + qtyAccepted })
        .eq("id", line.purchaseOrderLineId);
    }
  }

  await refreshPurchaseOrderStatus(supabase, params.tenantId, params.poId);

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.receivedBy,
    action: "po_goods_received",
    entityType: "purchase_order",
    entityId: params.poId,
    after: { receipt_number: receipt.receipt_number, has_discrepancy: anyDiscrepancy },
  });

  if (anyDiscrepancy) {
    await notifyGoodsReceivedDiscrepancy({
      tenantId: params.tenantId,
      poNumber: po.po_number as string,
      receiptNumber: receipt.receipt_number as string,
      entityId: params.poId,
    });
  }

  const [full] = await mapReceiptsWithLines(supabase, params.tenantId, [receipt as Record<string, unknown>]);
  return { receipt: full ?? null, error: null };
}
