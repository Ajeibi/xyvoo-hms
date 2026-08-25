import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { postJournalEntry } from "@/lib/hms/journal-entries";

export type VendorBillPaymentRow = {
  id: string;
  paymentDate: string;
  bankAccountId: string;
  bankAccountCode: string;
  bankAccountName: string;
  reference: string | null;
  total: number;
  billCount: number;
  createdBy: string;
  createdAt: string;
};

type AccountEmbed = { code: string; name: string } | { code: string; name: string }[] | null;

export async function listPaymentRuns(service: SupabaseClient, tenantId: string): Promise<VendorBillPaymentRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("vendor_bill_payments")
    .select("id,payment_date,bank_account_id,reference,total,created_by,created_at,chart_of_accounts(code,name)")
    .eq("tenant_id", tenantId)
    .order("payment_date", { ascending: false });
  if (error) throw new Error(error.message);

  const payments = (data ?? []) as Record<string, unknown>[];
  const paymentIds = payments.map((p) => p.id as string);
  const countByPayment = new Map<string, number>();
  if (paymentIds.length > 0) {
    const { data: lines } = await service
      .schema("hotel")
      .from("vendor_bill_payment_lines")
      .select("payment_id")
      .eq("tenant_id", tenantId)
      .in("payment_id", paymentIds);
    for (const l of lines ?? []) {
      const id = l.payment_id as string;
      countByPayment.set(id, (countByPayment.get(id) ?? 0) + 1);
    }
  }

  return payments.map((p) => {
    const acct = p.chart_of_accounts as AccountEmbed;
    const a = Array.isArray(acct) ? acct[0] : acct;
    return {
      id: p.id as string,
      paymentDate: p.payment_date as string,
      bankAccountId: p.bank_account_id as string,
      bankAccountCode: a?.code ?? "",
      bankAccountName: a?.name ?? "",
      reference: (p.reference as string | null) ?? null,
      total: Number(p.total) || 0,
      billCount: countByPayment.get(p.id as string) ?? 0,
      createdBy: p.created_by as string,
      createdAt: p.created_at as string,
    };
  });
}

/**
 * Pays one or more already-approved bills in a single batch. Each bill still gets its
 * own journal entry (Dr Accounts Payable, Cr the paying bank/cash account) so the
 * ledger stays traceable per bill, not just per batch — mirroring how a single
 * approval already posts one entry per bill rather than a combined one.
 *
 * Not wrapped in a database transaction: if a later bill's posting fails, earlier
 * bills in the same run are already paid and posted. Acceptable for this milestone's
 * scope (a paused caller sees exactly which bills succeeded via the returned ids and
 * can retry only the rest) but worth knowing if this ever needs stricter atomicity.
 */
export async function createPaymentRun(
  service: SupabaseClient,
  params: {
    tenantId: string;
    paymentDate: string;
    bankAccountId: string;
    apAccountId: string;
    reference?: string | null;
    billIds: string[];
    createdBy: string;
  },
): Promise<{ ok: true; id: string; paidBillIds: string[] } | { ok: false; error: string; paidBillIds: string[] }> {
  if (params.billIds.length === 0) return { ok: false, error: "Select at least one bill to pay.", paidBillIds: [] };

  const { data: bankAccount } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,is_active")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.bankAccountId)
    .maybeSingle();
  if (!bankAccount) return { ok: false, error: "Bank/cash account not found.", paidBillIds: [] };
  if (!bankAccount.is_active) return { ok: false, error: "Cannot pay from an inactive account.", paidBillIds: [] };

  const { data: bills } = await service
    .schema("hotel")
    .from("vendor_bills")
    .select("id,status,department,total,bill_reference,bill_date")
    .eq("tenant_id", params.tenantId)
    .in("id", params.billIds);
  const billRows = (bills ?? []) as {
    id: string;
    status: string;
    department: string;
    total: number;
    bill_reference: string | null;
    bill_date: string;
  }[];

  if (billRows.length !== params.billIds.length) return { ok: false, error: "One or more bills were not found.", paidBillIds: [] };
  if (billRows.some((b) => b.status !== "approved")) {
    return { ok: false, error: "Only approved, unpaid bills can be paid.", paidBillIds: [] };
  }

  const total = billRows.reduce((sum, b) => sum + (Number(b.total) || 0), 0);

  const { data: payment, error } = await service
    .schema("hotel")
    .from("vendor_bill_payments")
    .insert({
      tenant_id: params.tenantId,
      payment_date: params.paymentDate,
      bank_account_id: params.bankAccountId,
      reference: params.reference ?? null,
      total,
      created_by: params.createdBy,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message, paidBillIds: [] };
  const paymentId = payment.id as string;

  const paidBillIds: string[] = [];
  for (const bill of billRows) {
    const billTotal = Number(bill.total) || 0;
    const posted = await postJournalEntry(service, {
      tenantId: params.tenantId,
      entryDate: params.paymentDate,
      memo: `Payment of vendor bill ${bill.bill_reference ?? bill.id}`,
      reference: paymentId,
      createdBy: params.createdBy,
      lines: [
        { accountId: params.apAccountId, department: bill.department, debit: billTotal, credit: 0 },
        { accountId: params.bankAccountId, department: bill.department, debit: 0, credit: billTotal },
      ],
    });
    if (!posted.ok) return { ok: false, error: `Paid ${paidBillIds.length} of ${billRows.length} bills, then failed: ${posted.error}`, paidBillIds };

    await service.schema("hotel").from("vendor_bill_payment_lines").insert({
      tenant_id: params.tenantId,
      payment_id: paymentId,
      vendor_bill_id: bill.id,
      amount: billTotal,
      journal_entry_id: posted.id,
    });
    await service.schema("hotel").from("vendor_bills").update({ status: "paid" }).eq("id", bill.id);
    paidBillIds.push(bill.id);
  }

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.createdBy,
    action: "vendor_bill_payment_run_created",
    entityType: "vendor_bill_payment",
    entityId: paymentId,
    after: { total, billCount: billRows.length },
  });
  await emitNotification({
    tenantId: params.tenantId,
    type: "vendor_bill_payment_recorded",
    title: "Vendor bills paid",
    body: `${billRows.length} bill(s) totaling ${total.toFixed(2)} were paid.`,
    severity: "info",
    entityType: "vendor_bill_payment",
    entityId: paymentId,
  });

  return { ok: true, id: paymentId, paidBillIds };
}

export type ApAgingRow = {
  vendorId: string;
  vendorName: string;
  current: number;
  overdue1to30: number;
  overdue31to60: number;
  overdue61to90: number;
  overdue90plus: number;
  total: number;
};

/** Buckets every approved-but-unpaid bill by how overdue it is against its due date
 * (falling back to bill date when no due date was set), grouped by vendor. */
export async function getApAgingReport(service: SupabaseClient, tenantId: string): Promise<ApAgingRow[]> {
  const { data } = await service
    .schema("hotel")
    .from("vendor_bills")
    .select("vendor_id,total,due_date,bill_date,vendors(name)")
    .eq("tenant_id", tenantId)
    .eq("status", "approved");

  const rows = (data ?? []) as {
    vendor_id: string;
    total: number;
    due_date: string | null;
    bill_date: string;
    vendors: { name: string } | { name: string }[] | null;
  }[];
  const now = Date.now();
  const byVendor = new Map<string, ApAgingRow>();

  for (const r of rows) {
    const vendorEmbed = r.vendors as { name: string } | { name: string }[] | null;
    const v = Array.isArray(vendorEmbed) ? vendorEmbed[0] : vendorEmbed;
    const dueDate = r.due_date ?? r.bill_date;
    const daysOverdue = Math.floor((now - new Date(dueDate).getTime()) / 86_400_000);
    const total = Number(r.total) || 0;

    const existing: ApAgingRow = byVendor.get(r.vendor_id) ?? {
      vendorId: r.vendor_id,
      vendorName: v?.name ?? "Unknown vendor",
      current: 0,
      overdue1to30: 0,
      overdue31to60: 0,
      overdue61to90: 0,
      overdue90plus: 0,
      total: 0,
    };

    if (daysOverdue <= 0) existing.current += total;
    else if (daysOverdue <= 30) existing.overdue1to30 += total;
    else if (daysOverdue <= 60) existing.overdue31to60 += total;
    else if (daysOverdue <= 90) existing.overdue61to90 += total;
    else existing.overdue90plus += total;
    existing.total += total;

    byVendor.set(r.vendor_id, existing);
  }

  return [...byVendor.values()].sort((a, b) => b.total - a.total);
}
