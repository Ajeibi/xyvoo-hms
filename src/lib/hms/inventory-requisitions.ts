import type { SupabaseClient } from "@supabase/supabase-js";
import { postStockMovement, resolveInventoryItemDisplay } from "@/lib/hms/inventory-stock";
import type {
  InventoryRequisitionRow,
  InventoryRequisitionStatus,
  InventoryRequisitionWithLines,
} from "@/lib/hms/inventory-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function requisitionNumber() {
  return `REQ-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function mapRequisition(r: Record<string, unknown>): InventoryRequisitionRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    requisition_number: r.requisition_number as string,
    requesting_department: r.requesting_department as string,
    from_location_id: r.from_location_id as string,
    status: r.status as InventoryRequisitionStatus,
    requested_by: r.requested_by as string,
    approved_by: (r.approved_by as string) ?? null,
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

async function attachLinesAndLocation(
  supabase: SupabaseClient,
  tenantId: string,
  requisitions: InventoryRequisitionRow[],
): Promise<InventoryRequisitionWithLines[]> {
  if (!requisitions.length) return [];
  const reqIds = requisitions.map((r) => r.id);
  const locationIds = [...new Set(requisitions.map((r) => r.from_location_id))];

  const [{ data: lines }, { data: locations }] = await Promise.all([
    supabase.schema("hotel").from("inventory_requisition_lines").select("*").in("requisition_id", reqIds),
    supabase.schema("hotel").from("inventory_locations").select("id,name").eq("tenant_id", tenantId).in("id", locationIds),
  ]);

  const itemIds = [...new Set((lines ?? []).map((l) => l.item_id as string))];
  const itemById = await resolveInventoryItemDisplay(supabase, tenantId, itemIds);
  const locationById = new Map((locations ?? []).map((l) => [l.id as string, l.name as string]));
  const linesByReq = new Map<string, InventoryRequisitionWithLines["lines"]>();
  for (const l of lines ?? []) {
    const item = itemById.get(l.item_id as string);
    const list = linesByReq.get(l.requisition_id as string) ?? [];
    list.push({
      id: l.id as string,
      tenant_id: l.tenant_id as string,
      requisition_id: l.requisition_id as string,
      item_id: l.item_id as string,
      qty_requested: num(l.qty_requested),
      qty_issued: num(l.qty_issued),
      created_at: l.created_at as string,
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? "",
      unit_of_measure: item?.unit_of_measure ?? "—",
    });
    linesByReq.set(l.requisition_id as string, list);
  }

  return requisitions.map((r) => ({
    ...r,
    from_location_name: locationById.get(r.from_location_id) ?? "Store",
    lines: linesByReq.get(r.id) ?? [],
  }));
}

export async function listRequisitions(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { status?: InventoryRequisitionStatus[]; limit?: number },
) {
  let q = supabase
    .schema("hotel")
    .from("inventory_requisitions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.status?.length) q = q.in("status", opts.status);

  const { data } = await q;
  const requisitions = (data ?? []).map((r) => mapRequisition(r as Record<string, unknown>));
  return attachLinesAndLocation(supabase, tenantId, requisitions);
}

export async function getRequisitionById(supabase: SupabaseClient, tenantId: string, requisitionId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("inventory_requisitions")
    .select("*")
    .eq("id", requisitionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const [full] = await attachLinesAndLocation(supabase, tenantId, [mapRequisition(data as Record<string, unknown>)]);
  return full ?? null;
}

export async function createRequisition(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    requestingDepartment: string;
    fromLocationId: string;
    requestedBy: string;
    notes?: string;
    lines: { itemId: string; qty: number }[];
  },
) {
  if (!params.lines.length) return { requisition: null, error: "Add at least one item." };

  const { data: req, error } = await supabase
    .schema("hotel")
    .from("inventory_requisitions")
    .insert({
      tenant_id: params.tenantId,
      requisition_number: requisitionNumber(),
      requesting_department: params.requestingDepartment,
      from_location_id: params.fromLocationId,
      requested_by: params.requestedBy,
      notes: params.notes?.trim() || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !req) return { requisition: null, error: error?.message ?? "Could not create requisition." };

  const { error: linesError } = await supabase.schema("hotel").from("inventory_requisition_lines").insert(
    params.lines.map((l) => ({
      tenant_id: params.tenantId,
      requisition_id: req.id,
      item_id: l.itemId,
      qty_requested: l.qty,
    })),
  );
  if (linesError) return { requisition: null, error: linesError.message };

  const full = await getRequisitionById(supabase, params.tenantId, req.id as string);
  return { requisition: full, error: null };
}

export async function approveRequisition(supabase: SupabaseClient, tenantId: string, requisitionId: string, approvedBy: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_requisitions")
    .update({ status: "approved", approved_by: approvedBy, updated_at: new Date().toISOString() })
    .eq("id", requisitionId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not approve requisition." };
  return { error: null };
}

export async function rejectRequisition(supabase: SupabaseClient, tenantId: string, requisitionId: string, approvedBy: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_requisitions")
    .update({ status: "rejected", approved_by: approvedBy, updated_at: new Date().toISOString() })
    .eq("id", requisitionId)
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "approved"])
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not reject requisition." };
  return { error: null };
}

export async function issueRequisition(
  supabase: SupabaseClient,
  tenantId: string,
  requisitionId: string,
  performedBy: string,
  lineIssues: { lineId: string; qtyIssued: number }[],
) {
  const requisition = await getRequisitionById(supabase, tenantId, requisitionId);
  if (!requisition) return { error: "Requisition not found." };
  if (!["approved", "partially_issued"].includes(requisition.status)) {
    return { error: "Requisition must be approved before issuing." };
  }

  for (const issue of lineIssues) {
    if (issue.qtyIssued <= 0) continue;
    const line = requisition.lines.find((l) => l.id === issue.lineId);
    if (!line) continue;
    const remaining = line.qty_requested - line.qty_issued;
    const qtyToIssue = Math.min(issue.qtyIssued, remaining);
    if (qtyToIssue <= 0) continue;

    const result = await postStockMovement(supabase, {
      tenantId,
      itemId: line.item_id,
      locationId: requisition.from_location_id,
      movementType: "issue",
      qty: -qtyToIssue,
      referenceType: "requisition",
      referenceId: requisitionId,
      performedBy,
      note: `Issued to ${requisition.requesting_department}`,
    });
    if (result.error) return { error: result.error };

    await supabase
      .schema("hotel")
      .from("inventory_requisition_lines")
      .update({ qty_issued: line.qty_issued + qtyToIssue })
      .eq("id", line.id);
  }

  const refreshed = await getRequisitionById(supabase, tenantId, requisitionId);
  if (!refreshed) return { error: "Requisition not found." };
  const fullyIssued = refreshed.lines.every((l) => l.qty_issued >= l.qty_requested);
  const anyIssued = refreshed.lines.some((l) => l.qty_issued > 0);

  await supabase
    .schema("hotel")
    .from("inventory_requisitions")
    .update({
      status: fullyIssued ? "issued" : anyIssued ? "partially_issued" : refreshed.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requisitionId)
    .eq("tenant_id", tenantId);

  return { error: null };
}

export async function cancelRequisition(supabase: SupabaseClient, tenantId: string, requisitionId: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("inventory_requisitions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", requisitionId)
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "approved"])
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not cancel requisition." };
  return { error: null };
}
