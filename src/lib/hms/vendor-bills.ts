import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { resolveRequiredApproverRole } from "@/lib/hms/procurement-orders";
import type { ApproverRole } from "@/lib/hms/procurement-types";
import { postJournalEntry, reverseJournalEntry } from "@/lib/hms/journal-entries";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Resolves the tenant's Accounts Payable control account (starter-chart code "2000").
 * Shared by the manual vendor-bill API route and any auto-posting caller (e.g. Procurement
 * receiving) so both use the exact same lookup instead of duplicating it. */
export async function getApAccountId(service: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", "2000")
    .eq("is_active", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

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
  /** Sum of every payment line recorded against this bill so far — 0 unless it's been
   * partially paid. A bill stays "approved" (not "paid") until this reaches `total`. */
  amountPaid: number;
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
    amountPaid: 0,
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
  const rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));

  const billIds = rows.map((r) => r.id);
  if (billIds.length > 0) {
    const { data: paymentLines } = await service
      .schema("hotel")
      .from("vendor_bill_payment_lines")
      .select("vendor_bill_id,amount")
      .eq("tenant_id", tenantId)
      .in("vendor_bill_id", billIds);
    const paidByBill = new Map<string, number>();
    for (const line of paymentLines ?? []) {
      const id = line.vendor_bill_id as string;
      paidByBill.set(id, (paidByBill.get(id) ?? 0) + (Number(line.amount) || 0));
    }
    for (const row of rows) row.amountPaid = round2(paidByBill.get(row.id) ?? 0);
  }

  return rows;
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
      fxRate: params.fxRate ?? 1,
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
    fxRate: number;
    billReference: string | null;
    billDate: string;
    postedBy: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  // The ledger has no per-line currency — everything posts in the tenant's base currency.
  // `total` is in the bill's own currency, so it's converted using the rate captured on the
  // bill at entry time before it ever reaches the chart of accounts / trial balance.
  const baseAmount = round2(params.total * (params.fxRate || 1));
  const memo = params.billReference ? `Vendor bill ${params.billReference}` : "Vendor bill";
  const result = await postJournalEntry(service, {
    tenantId: params.tenantId,
    entryDate: params.billDate,
    memo,
    reference: params.billId,
    createdBy: params.postedBy,
    lines: [
      { accountId: params.expenseAccountId, department: params.department, debit: baseAmount, credit: 0 },
      { accountId: params.apAccountId, department: params.department, debit: 0, credit: baseAmount },
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
    .select("id,status,department,expense_account_id,total,fx_rate,bill_reference,bill_date")
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
    fxRate: Number(bill.fx_rate) || 1,
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

/** Voids an already-posted (approved) bill by reversing its journal entry and marking it
 * cancelled. A `pending_approval` bill was never posted — use `rejectVendorBill` for that case
 * instead. Required now that receiving auto-creates a bill per receipt: wrong-cost/wrong-line
 * corrections will happen regularly and previously had no supported fix (nothing in this
 * codebase ever set a bill to "cancelled" before this function existed). */
export async function voidVendorBill(
  service: SupabaseClient,
  params: { tenantId: string; billId: string; voidedBy: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: bill } = await service
    .schema("hotel")
    .from("vendor_bills")
    .select("id,status,journal_entry_id,department,bill_reference")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.billId)
    .maybeSingle();
  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.status !== "approved") {
    return {
      ok: false,
      error:
        bill.status === "pending_approval"
          ? "This bill hasn't been posted yet — reject it instead of voiding."
          : `Only an approved (posted) bill can be voided (currently ${bill.status}).`,
    };
  }
  if (!bill.journal_entry_id) {
    return { ok: false, error: "This bill has no linked journal entry to reverse." };
  }

  const { data: paymentLines } = await service
    .schema("hotel")
    .from("vendor_bill_payment_lines")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("vendor_bill_id", params.billId)
    .limit(1);
  if (paymentLines && paymentLines.length > 0) {
    return { ok: false, error: "This bill has payments recorded against it — reverse the payments first." };
  }

  const reversal = await reverseJournalEntry(service, {
    tenantId: params.tenantId,
    journalEntryId: bill.journal_entry_id as string,
    actorUserId: params.voidedBy,
    memo: `Void of vendor bill ${(bill.bill_reference as string | null) ?? params.billId.slice(0, 8)}`,
  });
  if (!reversal.ok) return reversal;

  const { error } = await service.schema("hotel").from("vendor_bills").update({ status: "cancelled" }).eq("id", params.billId);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.voidedBy,
    action: "vendor_bill_voided",
    entityType: "vendor_bill",
    entityId: params.billId,
  });

  return { ok: true };
}
