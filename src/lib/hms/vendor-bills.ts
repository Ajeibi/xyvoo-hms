import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { resolveRequiredApproverRole } from "@/lib/hms/procurement-orders";
import type { ApproverRole } from "@/lib/hms/procurement-types";
import { postJournalEntry } from "@/lib/hms/journal-entries";

export const VENDOR_BILL_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
  "paid",
] as const;
export type VendorBillStatus = (typeof VENDOR_BILL_STATUSES)[number];

export type VendorBillRow = {
  id: string;
  vendorId: string;
  vendorName: string;
  purchaseOrderId: string | null;
  department: string;
  billReference: string | null;
  billDate: string;
  dueDate: string | null;
  currency: string;
  fxRate: number;
  expenseAccountId: string;
  expenseAccountCode: string;
  expenseAccountName: string;
  subtotal: number;
  tax: number;
  total: number;
  status: VendorBillStatus;
  notes: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  journalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
};

type AccountEmbed = { code: string; name: string } | { code: string; name: string }[] | null;
type VendorEmbed = { name: string } | { name: string }[] | null;

function mapRow(r: Record<string, unknown>): VendorBillRow {
  const acct = r.chart_of_accounts as AccountEmbed;
  const a = Array.isArray(acct) ? acct[0] : acct;
  const vendorEmbed = r.vendors as VendorEmbed;
  const v = Array.isArray(vendorEmbed) ? vendorEmbed[0] : vendorEmbed;

  return {
    id: r.id as string,
    vendorId: r.vendor_id as string,
    vendorName: v?.name ?? "Unknown vendor",
    purchaseOrderId: (r.purchase_order_id as string | null) ?? null,
    department: r.department as string,
    billReference: (r.bill_reference as string | null) ?? null,
    billDate: r.bill_date as string,
    dueDate: (r.due_date as string | null) ?? null,
    currency: r.currency as string,
    fxRate: Number(r.fx_rate) || 1,
    expenseAccountId: r.expense_account_id as string,
    expenseAccountCode: a?.code ?? "",
    expenseAccountName: a?.name ?? "",
    subtotal: Number(r.subtotal) || 0,
    tax: Number(r.tax) || 0,
    total: Number(r.total) || 0,
    status: r.status as VendorBillStatus,
    notes: (r.notes as string | null) ?? null,
    createdBy: r.created_by as string,
    approvedBy: (r.approved_by as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    rejectionReason: (r.rejection_reason as string | null) ?? null,
    journalEntryId: (r.journal_entry_id as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function listVendorBills(
  service: SupabaseClient,
  tenantId: string,
  opts?: { status?: VendorBillStatus },
): Promise<VendorBillRow[]> {
  let q = service
    .schema("hotel")
    .from("vendor_bills")
    .select(
      "id,vendor_id,purchase_order_id,department,bill_reference,bill_date,due_date,currency,fx_rate,expense_account_id,subtotal,tax,total,status,notes,created_by,approved_by,approved_at,rejection_reason,journal_entry_id,created_at,updated_at,chart_of_accounts(code,name),vendors(name)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** The required-approver check + auto-approve/pending decision mirrors
 * `createPurchaseOrder` in procurement-orders.ts exactly, sharing the same
 * department+amount threshold configuration rather than a second copy of it. */
export async function createVendorBill(
  service: SupabaseClient,
  params: {
    tenantId: string;
    vendorId: string;
    purchaseOrderId?: string | null;
    department: string;
    billReference?: string | null;
    billDate: string;
    dueDate?: string | null;
    currency: string;
    fxRate?: number;
    expenseAccountId: string;
    apAccountId: string;
    subtotal: number;
    tax?: number;
    notes?: string | null;
    createdBy: string;
  },
): Promise<{ ok: true; id: string; status: VendorBillStatus; requiredApproverRole: ApproverRole } | { ok: false; error: string }> {
  const { data: vendor } = await service
    .schema("hotel")
    .from("vendors")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.vendorId)
    .maybeSingle();
  if (!vendor) return { ok: false, error: "Vendor not found." };

  const { data: expenseAccount } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,is_active")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.expenseAccountId)
    .maybeSingle();
  if (!expenseAccount) return { ok: false, error: "Expense account not found." };
  if (!expenseAccount.is_active) return { ok: false, error: "Cannot post to an inactive account." };

  const subtotal = Number(params.subtotal) || 0;
  const tax = Number(params.tax) || 0;
  const total = Math.round((subtotal + tax) * 100) / 100;
  if (total <= 0) return { ok: false, error: "Bill total must be greater than zero." };

  const requiredApproverRole = await resolveRequiredApproverRole(service, params.tenantId, params.department, total);
  const status: VendorBillStatus = requiredApproverRole === "auto" ? "approved" : "pending_approval";

  const { data: inserted, error } = await service
    .schema("hotel")
    .from("vendor_bills")
    .insert({
      tenant_id: params.tenantId,
      vendor_id: params.vendorId,
      purchase_order_id: params.purchaseOrderId ?? null,
      department: params.department,
      bill_reference: params.billReference ?? null,
      bill_date: params.billDate,
      due_date: params.dueDate ?? null,
      currency: params.currency,
      fx_rate: params.fxRate ?? 1,
      expense_account_id: params.expenseAccountId,
      subtotal,
      tax,
      total,
      status,
      notes: params.notes ?? null,
      created_by: params.createdBy,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  const billId = inserted.id as string;

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.createdBy,
    action: "vendor_bill_created",
    entityType: "vendor_bill",
    entityId: billId,
    after: { vendor_id: params.vendorId, department: params.department, total },
  });

  if (status === "approved") {
    // Below every configured threshold — committed spend immediately, same as an auto-approved PO.
    await postBillToLedger(service, {
      tenantId: params.tenantId,
      billId,
      department: params.department,
      expenseAccountId: params.expenseAccountId,
      apAccountId: params.apAccountId,
      total,
      billReference: params.billReference ?? null,
      billDate: params.billDate,
      postedBy: params.createdBy,
    });
    await service
      .schema("hotel")
      .from("vendor_bills")
      .update({ approved_by: params.createdBy, approved_at: new Date().toISOString() })
      .eq("id", billId);
  } else {
    await emitNotification({
      tenantId: params.tenantId,
      type: "vendor_bill_approval_needed",
      title: "Vendor bill awaiting approval",
      body: `A bill for ${total.toFixed(2)} ${params.currency} needs ${requiredApproverRole === "finance" ? "Finance" : "GM/Owner"} approval.`,
      severity: "warning",
      entityType: "vendor_bill",
      entityId: billId,
      department: params.department,
    });
  }

  return { ok: true, id: billId, status, requiredApproverRole };
}

async function postBillToLedger(
  service: SupabaseClient,
  params: {
    tenantId: string;
    billId: string;
    department: string;
    expenseAccountId: string;
    apAccountId: string;
    total: number;
    billReference: string | null;
    billDate: string;
    postedBy: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memo = params.billReference ? `Vendor bill ${params.billReference}` : "Vendor bill";
  const result = await postJournalEntry(service, {
    tenantId: params.tenantId,
    entryDate: params.billDate,
    memo,
    reference: params.billId,
    createdBy: params.postedBy,
    lines: [
      { accountId: params.expenseAccountId, department: params.department, debit: params.total, credit: 0 },
      { accountId: params.apAccountId, department: params.department, debit: 0, credit: params.total },
    ],
  });
  if (!result.ok) return result;

  await service
    .schema("hotel")
    .from("vendor_bills")
    .update({ journal_entry_id: result.id })
    .eq("id", params.billId);

  return { ok: true };
}

export async function approveVendorBill(
  service: SupabaseClient,
  params: { tenantId: string; billId: string; approvedBy: string; apAccountId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: bill } = await service
    .schema("hotel")
    .from("vendor_bills")
    .select("id,status,department,expense_account_id,total,bill_reference,bill_date")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.billId)
    .maybeSingle();

  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.status !== "pending_approval") {
    return { ok: false, error: `Only a bill awaiting approval can be approved (currently ${bill.status}).` };
  }

  const posted = await postBillToLedger(service, {
    tenantId: params.tenantId,
    billId: params.billId,
    department: bill.department as string,
    expenseAccountId: bill.expense_account_id as string,
    apAccountId: params.apAccountId,
    total: Number(bill.total) || 0,
    billReference: (bill.bill_reference as string | null) ?? null,
    billDate: bill.bill_date as string,
    postedBy: params.approvedBy,
  });
  if (!posted.ok) return posted;

  const { error } = await service
    .schema("hotel")
    .from("vendor_bills")
    .update({ status: "approved", approved_by: params.approvedBy, approved_at: new Date().toISOString() })
    .eq("id", params.billId);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.approvedBy,
    action: "vendor_bill_approved",
    entityType: "vendor_bill",
    entityId: params.billId,
  });
  await emitNotification({
    tenantId: params.tenantId,
    type: "vendor_bill_approved",
    title: "Vendor bill approved",
    body: `Bill ${(bill.bill_reference as string | null) ?? params.billId.slice(0, 8)} was approved and posted to the ledger.`,
    severity: "info",
    entityType: "vendor_bill",
    entityId: params.billId,
    department: bill.department as string,
  });

  return { ok: true };
}

export async function rejectVendorBill(
  service: SupabaseClient,
  params: { tenantId: string; billId: string; rejectedBy: string; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!params.reason.trim()) return { ok: false, error: "A reason is required to reject a bill." };

  const { data: bill } = await service
    .schema("hotel")
    .from("vendor_bills")
    .select("id,status,department,bill_reference")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.billId)
    .maybeSingle();

  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.status !== "pending_approval") {
    return { ok: false, error: `Only a bill awaiting approval can be rejected (currently ${bill.status}).` };
  }

  const { error } = await service
    .schema("hotel")
    .from("vendor_bills")
    .update({ status: "rejected", rejection_reason: params.reason.trim() })
    .eq("id", params.billId);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.rejectedBy,
    action: "vendor_bill_rejected",
    entityType: "vendor_bill",
    entityId: params.billId,
    after: { reason: params.reason.trim() },
  });
  await emitNotification({
    tenantId: params.tenantId,
    type: "vendor_bill_rejected",
    title: "Vendor bill rejected",
    body: `Bill ${(bill.bill_reference as string | null) ?? params.billId.slice(0, 8)} was rejected: ${params.reason.trim()}`,
    severity: "warning",
    entityType: "vendor_bill",
    entityId: params.billId,
    department: bill.department as string,
  });

  return { ok: true };
}
