import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveInventoryItemDisplay } from "@/lib/hms/inventory-stock";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { notifyPoApprovalNeeded, notifyPoApproved, notifyPoRejected } from "@/lib/hms/notification-rules";
import { checkAndNotifyBudgetThreshold } from "@/lib/hms/procurement-budgets";
import type {
  ApprovalThresholdRow,
  ApproverRole,
  PurchaseOrderLineWithItem,
  PurchaseOrderRow,
  PurchaseOrderStatus,
  PurchaseOrderWithLines,
  SourceableRequisitionLine,
} from "@/lib/hms/procurement-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function poNumber() {
  return `PO-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function mapPurchaseOrder(r: Record<string, unknown>): PurchaseOrderRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    po_number: r.po_number as string,
    vendor_id: r.vendor_id as string,
    department: r.department as string,
    status: r.status as PurchaseOrderStatus,
    currency: (r.currency as string) ?? "NGN",
    fx_rate: num(r.fx_rate) || 1,
    subtotal: num(r.subtotal),
    tax: num(r.tax),
    total: num(r.total),
    expected_delivery_date: (r.expected_delivery_date as string) ?? null,
    is_manual: Boolean(r.is_manual),
    manual_reason: (r.manual_reason as string) ?? null,
    notes: (r.notes as string) ?? null,
    requested_by: (r.requested_by as string) ?? null,
    created_by: r.created_by as string,
    approved_by: (r.approved_by as string) ?? null,
    approved_at: (r.approved_at as string) ?? null,
    rejection_reason: (r.rejection_reason as string) ?? null,
    invoice_number: (r.invoice_number as string) ?? null,
    invoice_amount: r.invoice_amount != null ? num(r.invoice_amount) : null,
    invoice_matched_at: (r.invoice_matched_at as string) ?? null,
    invoice_variance: r.invoice_variance != null ? num(r.invoice_variance) : null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function mapLine(r: Record<string, unknown>): PurchaseOrderLineWithItem {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    po_id: r.po_id as string,
    requisition_line_id: (r.requisition_line_id as string) ?? null,
    item_id: (r.item_id as string) ?? null,
    description: r.description as string,
    quantity: num(r.quantity),
    unit_cost: num(r.unit_cost),
    line_total: num(r.line_total),
    quantity_received: num(r.quantity_received),
    created_at: r.created_at as string,
    item_name: null,
    item_sku: null,
    unit_of_measure: null,
  };
}

// --- Approval thresholds ---

function mapThreshold(r: Record<string, unknown>): ApprovalThresholdRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    department: r.department as string,
    min_amount: num(r.min_amount),
    max_amount: r.max_amount != null ? num(r.max_amount) : null,
    approver_role: r.approver_role as ApproverRole,
    sort_order: Number(r.sort_order) || 0,
    created_at: r.created_at as string,
  };
}

export async function listApprovalThresholds(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("procurement_approval_thresholds")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => mapThreshold(r as Record<string, unknown>));
}

export async function createApprovalThreshold(
  supabase: SupabaseClient,
  params: { tenantId: string; department: string; minAmount: number; maxAmount: number | null; approverRole: ApproverRole; sortOrder?: number },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("procurement_approval_thresholds")
    .insert({
      tenant_id: params.tenantId,
      department: params.department.trim(),
      min_amount: params.minAmount,
      max_amount: params.maxAmount,
      approver_role: params.approverRole,
      sort_order: params.sortOrder ?? 0,
    })
    .select("*")
    .single();
  if (error || !data) return { threshold: null, error: error?.message ?? "Could not create threshold." };
  return { threshold: mapThreshold(data as Record<string, unknown>), error: null };
}

export async function updateApprovalThreshold(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: { department?: string; minAmount?: number; maxAmount?: number | null; approverRole?: ApproverRole; sortOrder?: number },
) {
  const update: Record<string, unknown> = {};
  if (patch.department !== undefined) update.department = patch.department.trim();
  if (patch.minAmount !== undefined) update.min_amount = patch.minAmount;
  if (patch.maxAmount !== undefined) update.max_amount = patch.maxAmount;
  if (patch.approverRole !== undefined) update.approver_role = patch.approverRole;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

  const { data, error } = await supabase
    .schema("hotel")
    .from("procurement_approval_thresholds")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { threshold: null, error: error?.message ?? "Could not update threshold." };
  return { threshold: mapThreshold(data as Record<string, unknown>), error: null };
}

export async function deleteApprovalThreshold(supabase: SupabaseClient, tenantId: string, id: string) {
  const { error } = await supabase.schema("hotel").from("procurement_approval_thresholds").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  return { error: null };
}

/** Resolves which approver tier a PO total requires, department-specific thresholds taking priority over "All departments". */
async function resolveRequiredApproverRole(
  supabase: SupabaseClient,
  tenantId: string,
  department: string,
  total: number,
): Promise<ApproverRole> {
  const thresholds = await listApprovalThresholds(supabase, tenantId);
  const inRange = (t: ApprovalThresholdRow) => total >= t.min_amount && (t.max_amount === null || total <= t.max_amount);

  const departmentMatch = thresholds.find((t) => t.department === department && inRange(t));
  if (departmentMatch) return departmentMatch.approver_role;

  const generalMatch = thresholds.find((t) => t.department === "All departments" && inRange(t));
  if (generalMatch) return generalMatch.approver_role;

  // No configured threshold covers this amount — default to the safest tier rather than auto-approving.
  return "gm";
}

// --- Sourceable requisition lines (the Procurement inbox) ---

/**
 * Approved/partially-issued requisition lines that still have quantity not
 * yet covered by an open PO line. Procurement sources against these — it
 * never creates a requisition itself (see hotel.inventory_requisitions,
 * created only by Inventory/Admin).
 */
export async function listSourceableRequisitionLines(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<SourceableRequisitionLine[]> {
  const { data: requisitions } = await supabase
    .schema("hotel")
    .from("inventory_requisitions")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["approved", "partially_issued"])
    .order("created_at", { ascending: true });
  if (!requisitions?.length) return [];

  const reqIds = requisitions.map((r) => r.id as string);
  const { data: lines } = await supabase
    .schema("hotel")
    .from("inventory_requisition_lines")
    .select("*")
    .in("requisition_id", reqIds);
  if (!lines?.length) return [];

  const lineIds = lines.map((l) => l.id as string);
  const { data: poLines } = await supabase
    .schema("hotel")
    .from("purchase_order_lines")
    .select("requisition_line_id,quantity,po_id")
    .in("requisition_line_id", lineIds);

  const poIds = [...new Set((poLines ?? []).map((l) => l.po_id as string))];
  const { data: pos } = poIds.length
    ? await supabase.schema("hotel").from("purchase_orders").select("id,status").in("id", poIds)
    : { data: [] };
  const activePoIds = new Set((pos ?? []).filter((p) => p.status !== "rejected" && p.status !== "cancelled").map((p) => p.id as string));

  const sourcedByLine = new Map<string, number>();
  for (const pl of poLines ?? []) {
    if (!activePoIds.has(pl.po_id as string)) continue;
    const reqLineId = pl.requisition_line_id as string;
    sourcedByLine.set(reqLineId, (sourcedByLine.get(reqLineId) ?? 0) + num(pl.quantity));
  }

  const requisitionById = new Map(requisitions.map((r) => [r.id as string, r]));
  const itemIds = [...new Set(lines.map((l) => l.item_id as string))];
  const itemDetails = await resolveInventoryItemDisplay(supabase, tenantId, itemIds);

  const result: SourceableRequisitionLine[] = [];
  for (const line of lines) {
    const req = requisitionById.get(line.requisition_id as string);
    if (!req) continue;
    const qtyRequested = num(line.qty_requested);
    const qtyIssued = num(line.qty_issued);
    const qtySourced = sourcedByLine.get(line.id as string) ?? 0;
    const qtyRemaining = Math.max(qtyRequested - qtyIssued - qtySourced, 0);
    if (qtyRemaining <= 0) continue;

    const item = itemDetails.get(line.item_id as string);
    result.push({
      requisitionId: req.id as string,
      requisitionNumber: req.requisition_number as string,
      requestingDepartment: req.requesting_department as string,
      requisitionLineId: line.id as string,
      itemId: line.item_id as string,
      itemName: item?.name ?? "Unknown item",
      itemSku: item?.sku ?? "",
      unitOfMeasure: item?.unit_of_measure ?? "—",
      unitCost: item?.unit_cost ?? 0,
      qtyRequested,
      qtyIssued,
      qtySourced,
      qtyRemaining,
    });
  }
  return result;
}

// --- Purchase orders ---

async function attachVendorAndLines(
  supabase: SupabaseClient,
  tenantId: string,
  orders: PurchaseOrderRow[],
): Promise<PurchaseOrderWithLines[]> {
  if (!orders.length) return [];
  const orderIds = orders.map((o) => o.id);
  const vendorIds = [...new Set(orders.map((o) => o.vendor_id))];

  const [{ data: lines }, { data: vendors }] = await Promise.all([
    supabase.schema("hotel").from("purchase_order_lines").select("*").in("po_id", orderIds),
    supabase.schema("hotel").from("vendors").select("id,name").eq("tenant_id", tenantId).in("id", vendorIds),
  ]);

  const itemIds = [...new Set((lines ?? []).map((l) => l.item_id as string).filter(Boolean))];
  const itemDetails = await resolveInventoryItemDisplay(supabase, tenantId, itemIds);
  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id as string, v.name as string]));

  const linesByPo = new Map<string, PurchaseOrderLineWithItem[]>();
  for (const l of lines ?? []) {
    const mapped = mapLine(l as Record<string, unknown>);
    if (mapped.item_id) {
      const item = itemDetails.get(mapped.item_id);
      mapped.item_name = item?.name ?? "Unknown item";
      mapped.item_sku = item?.sku ?? "";
      mapped.unit_of_measure = item?.unit_of_measure ?? "—";
    }
    const list = linesByPo.get(mapped.po_id) ?? [];
    list.push(mapped);
    linesByPo.set(mapped.po_id, list);
  }

  const withLines = await Promise.all(
    orders.map(async (o) => ({
      ...o,
      vendor_name: vendorNameById.get(o.vendor_id) ?? "Unknown vendor",
      lines: linesByPo.get(o.id) ?? [],
      requiredApproverRole: await resolveRequiredApproverRole(supabase, tenantId, o.department, o.total),
    })),
  );
  return withLines;
}

export async function listPurchaseOrders(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { status?: PurchaseOrderStatus[]; limit?: number },
) {
  let q = supabase
    .schema("hotel")
    .from("purchase_orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.status?.length) q = q.in("status", opts.status);

  const { data } = await q;
  const orders = (data ?? []).map((r) => mapPurchaseOrder(r as Record<string, unknown>));
  return attachVendorAndLines(supabase, tenantId, orders);
}

export async function getPurchaseOrderById(supabase: SupabaseClient, tenantId: string, poId: string) {
  const { data } = await supabase.schema("hotel").from("purchase_orders").select("*").eq("id", poId).eq("tenant_id", tenantId).maybeSingle();
  if (!data) return null;
  const [full] = await attachVendorAndLines(supabase, tenantId, [mapPurchaseOrder(data as Record<string, unknown>)]);
  return full ?? null;
}

export type CreatePurchaseOrderLineInput = {
  requisitionLineId?: string;
  itemId?: string;
  description: string;
  quantity: number;
  unitCost: number;
};

export async function createPurchaseOrder(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    vendorId: string;
    department: string;
    currency?: string;
    fxRate?: number;
    tax?: number;
    expectedDeliveryDate?: string;
    notes?: string;
    isManual: boolean;
    manualReason?: string;
    requestedBy?: string;
    createdBy: string;
    lines: CreatePurchaseOrderLineInput[];
  },
) {
  if (!params.lines.length) return { order: null, error: "Add at least one line item." };
  if (params.isManual && !params.manualReason?.trim()) {
    return { order: null, error: "A reason is required for a manually created purchase order." };
  }

  const subtotal = round2(params.lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0));
  const tax = round2(params.tax ?? 0);
  const total = round2(subtotal + tax);

  const requiredApproverRole = await resolveRequiredApproverRole(supabase, params.tenantId, params.department, total);
  const status: PurchaseOrderStatus = requiredApproverRole === "auto" ? "approved" : "pending_approval";

  const { data: order, error } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .insert({
      tenant_id: params.tenantId,
      po_number: poNumber(),
      vendor_id: params.vendorId,
      department: params.department,
      status,
      currency: params.currency?.trim().toUpperCase() || "NGN",
      fx_rate: params.fxRate ?? 1,
      subtotal,
      tax,
      total,
      expected_delivery_date: params.expectedDeliveryDate || null,
      is_manual: params.isManual,
      manual_reason: params.manualReason?.trim() || null,
      notes: params.notes?.trim() || null,
      requested_by: params.requestedBy ?? null,
      created_by: params.createdBy,
      approved_by: status === "approved" ? params.createdBy : null,
      approved_at: status === "approved" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error || !order) return { order: null, error: error?.message ?? "Could not create purchase order." };

  const { error: linesError } = await supabase.schema("hotel").from("purchase_order_lines").insert(
    params.lines.map((l) => ({
      tenant_id: params.tenantId,
      po_id: order.id,
      requisition_line_id: l.requisitionLineId ?? null,
      item_id: l.itemId ?? null,
      description: l.description.trim(),
      quantity: l.quantity,
      unit_cost: l.unitCost,
      line_total: round2(l.quantity * l.unitCost),
    })),
  );
  if (linesError) return { order: null, error: linesError.message };

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.createdBy,
    action: "po_created",
    entityType: "purchase_order",
    entityId: order.id as string,
    after: { po_number: order.po_number, total, status },
  });

  if (status === "pending_approval") {
    await notifyPoApprovalNeeded({
      tenantId: params.tenantId,
      poNumber: order.po_number as string,
      vendorName: "",
      total,
      currency: order.currency as string,
      entityId: order.id as string,
    });
  } else {
    // Auto-approved on creation (below every configured threshold) — it's committed spend immediately.
    await checkAndNotifyBudgetThreshold(supabase, params.tenantId, params.department);
  }

  const full = await getPurchaseOrderById(supabase, params.tenantId, order.id as string);
  return { order: full, error: null };
}

export async function approvePurchaseOrder(supabase: SupabaseClient, tenantId: string, poId: string, approvedBy: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .update({ status: "approved", approved_by: approvedBy, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", poId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_approval")
    .select("po_number,total,currency,department")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not approve purchase order." };

  await writeAuditLog({ tenantId, actorUserId: approvedBy, action: "po_approved", entityType: "purchase_order", entityId: poId });
  await checkAndNotifyBudgetThreshold(supabase, tenantId, data.department as string);
  await notifyPoApproved({
    tenantId,
    poNumber: data.po_number as string,
    total: num(data.total),
    currency: data.currency as string,
    entityId: poId,
  });
  return { error: null };
}

export async function rejectPurchaseOrder(
  supabase: SupabaseClient,
  tenantId: string,
  poId: string,
  rejectedBy: string,
  reason: string,
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .update({
      status: "rejected",
      approved_by: rejectedBy,
      rejection_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", poId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_approval")
    .select("po_number")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not reject purchase order." };

  await writeAuditLog({ tenantId, actorUserId: rejectedBy, action: "po_rejected", entityType: "purchase_order", entityId: poId, after: { reason } });
  await notifyPoRejected({ tenantId, poNumber: data.po_number as string, reason: reason.trim(), entityId: poId });
  return { error: null };
}

export async function cancelPurchaseOrder(supabase: SupabaseClient, tenantId: string, poId: string, cancelledBy: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", poId)
    .eq("tenant_id", tenantId)
    .in("status", ["draft", "pending_approval", "approved", "ordered"])
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not cancel purchase order." };

  await writeAuditLog({ tenantId, actorUserId: cancelledBy, action: "po_cancelled", entityType: "purchase_order", entityId: poId });
  return { error: null };
}

/** Procurement confirms the PO has been sent to / confirmed with the vendor. */
export async function markPurchaseOrderOrdered(supabase: SupabaseClient, tenantId: string, poId: string, actorUserId: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .update({ status: "ordered", updated_at: new Date().toISOString() })
    .eq("id", poId)
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not mark purchase order as ordered." };

  await writeAuditLog({ tenantId, actorUserId, action: "po_marked_ordered", entityType: "purchase_order", entityId: poId });
  return { error: null };
}

/** Simple 3-way match: compares the vendor invoice to the PO total within a fixed tolerance. */
export async function recordPurchaseOrderInvoice(
  supabase: SupabaseClient,
  tenantId: string,
  poId: string,
  params: { invoiceNumber: string; invoiceAmount: number; recordedBy: string },
) {
  const order = await getPurchaseOrderById(supabase, tenantId, poId);
  if (!order) return { error: "Purchase order not found." };

  const variance = round2(params.invoiceAmount - order.total);
  const tolerance = order.total * 0.02;
  const matched = Math.abs(variance) <= tolerance;

  const { error } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .update({
      invoice_number: params.invoiceNumber.trim(),
      invoice_amount: params.invoiceAmount,
      invoice_variance: variance,
      invoice_matched_at: matched ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", poId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  await writeAuditLog({
    tenantId,
    actorUserId: params.recordedBy,
    action: "po_invoice_recorded",
    entityType: "purchase_order",
    entityId: poId,
    after: { invoice_number: params.invoiceNumber, invoice_amount: params.invoiceAmount, variance, matched },
  });
  return { error: null, matched, variance };
}
