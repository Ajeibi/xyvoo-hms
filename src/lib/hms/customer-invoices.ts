import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { postJournalEntry } from "@/lib/hms/journal-entries";

export const CUSTOMER_INVOICE_STATUSES = ["open", "paid", "cancelled"] as const;
export type CustomerInvoiceStatus = (typeof CUSTOMER_INVOICE_STATUSES)[number];

export type CustomerInvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  reservationId: string | null;
  confirmationCode: string | null;
  department: string;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  revenueAccountId: string;
  revenueAccountCode: string;
  revenueAccountName: string;
  arAccountId: string;
  subtotal: number;
  tax: number;
  total: number;
  status: CustomerInvoiceStatus;
  notes: string | null;
  createdBy: string;
  journalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
};

type NameEmbed = { name: string } | { name: string }[] | null;
type AccountEmbed = { code: string; name: string } | { code: string; name: string }[] | null;

function mapRow(r: Record<string, unknown>): CustomerInvoiceRow {
  const customerEmbed = r.ar_customers as NameEmbed;
  const customer = Array.isArray(customerEmbed) ? customerEmbed[0] : customerEmbed;
  const acct = r.chart_of_accounts as AccountEmbed;
  const a = Array.isArray(acct) ? acct[0] : acct;
  const resEmbed = r.reservations as { confirmation_code: string } | { confirmation_code: string }[] | null;
  const res = Array.isArray(resEmbed) ? resEmbed[0] : resEmbed;

  return {
    id: r.id as string,
    invoiceNumber: r.invoice_number as string,
    customerId: r.customer_id as string,
    customerName: customer?.name ?? "Unknown customer",
    reservationId: (r.reservation_id as string | null) ?? null,
    confirmationCode: res?.confirmation_code ?? null,
    department: r.department as string,
    invoiceDate: r.invoice_date as string,
    dueDate: (r.due_date as string | null) ?? null,
    currency: r.currency as string,
    revenueAccountId: r.revenue_account_id as string,
    revenueAccountCode: a?.code ?? "",
    revenueAccountName: a?.name ?? "",
    arAccountId: r.ar_account_id as string,
    subtotal: Number(r.subtotal) || 0,
    tax: Number(r.tax) || 0,
    total: Number(r.total) || 0,
    status: r.status as CustomerInvoiceStatus,
    notes: (r.notes as string | null) ?? null,
    createdBy: r.created_by as string,
    journalEntryId: (r.journal_entry_id as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function listCustomerInvoices(
  service: SupabaseClient,
  tenantId: string,
  opts?: { status?: CustomerInvoiceStatus },
): Promise<CustomerInvoiceRow[]> {
  let q = service
    .schema("hotel")
    .from("customer_invoices")
    .select(
      "id,invoice_number,customer_id,reservation_id,department,invoice_date,due_date,currency,revenue_account_id,ar_account_id,subtotal,tax,total,status,notes,created_by,journal_entry_id,created_at,updated_at,ar_customers(name),chart_of_accounts!revenue_account_id(code,name),reservations(confirmation_code)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

async function nextInvoiceNumber(service: SupabaseClient, tenantId: string): Promise<string> {
  const { count } = await service
    .schema("hotel")
    .from("customer_invoices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return `INV-${String((count ?? 0) + 1).padStart(5, "0")}`;
}

/**
 * Unlike a vendor bill, an invoice has no approval gate — it posts to the ledger the
 * moment it's created (Dr arAccountId, Cr revenueAccountId), since raising it recognizes
 * revenue already earned rather than committing future spend.
 */
export async function createCustomerInvoice(
  service: SupabaseClient,
  params: {
    tenantId: string;
    customerId: string;
    reservationId?: string | null;
    department: string;
    invoiceDate: string;
    dueDate?: string | null;
    currency: string;
    revenueAccountId: string;
    arAccountId: string;
    subtotal: number;
    tax?: number;
    notes?: string | null;
    createdBy: string;
  },
): Promise<{ ok: true; id: string; invoiceNumber: string } | { ok: false; error: string }> {
  const { data: customer } = await service
    .schema("hotel")
    .from("ar_customers")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.customerId)
    .maybeSingle();
  if (!customer) return { ok: false, error: "Customer not found." };

  const { data: revenueAccount } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,is_active")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.revenueAccountId)
    .maybeSingle();
  if (!revenueAccount) return { ok: false, error: "Revenue account not found." };
  if (!revenueAccount.is_active) return { ok: false, error: "Cannot post to an inactive account." };

  const subtotal = Number(params.subtotal) || 0;
  const tax = Number(params.tax) || 0;
  const total = Math.round((subtotal + tax) * 100) / 100;
  if (total <= 0) return { ok: false, error: "Invoice total must be greater than zero." };

  const invoiceNumber = await nextInvoiceNumber(service, params.tenantId);

  const { data: inserted, error } = await service
    .schema("hotel")
    .from("customer_invoices")
    .insert({
      tenant_id: params.tenantId,
      invoice_number: invoiceNumber,
      customer_id: params.customerId,
      reservation_id: params.reservationId ?? null,
      department: params.department,
      invoice_date: params.invoiceDate,
      due_date: params.dueDate ?? null,
      currency: params.currency,
      revenue_account_id: params.revenueAccountId,
      ar_account_id: params.arAccountId,
      subtotal,
      tax,
      total,
      status: "open",
      notes: params.notes ?? null,
      created_by: params.createdBy,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  const invoiceId = inserted.id as string;

  const posted = await postJournalEntry(service, {
    tenantId: params.tenantId,
    entryDate: params.invoiceDate,
    memo: `Customer invoice ${invoiceNumber}`,
    reference: invoiceId,
    createdBy: params.createdBy,
    lines: [
      { accountId: params.arAccountId, department: params.department, debit: total, credit: 0 },
      { accountId: params.revenueAccountId, department: params.department, debit: 0, credit: total },
    ],
  });
  if (posted.ok) {
    await service.schema("hotel").from("customer_invoices").update({ journal_entry_id: posted.id }).eq("id", invoiceId);
  }

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.createdBy,
    action: "customer_invoice_created",
    entityType: "customer_invoice",
    entityId: invoiceId,
    after: { customer_id: params.customerId, total, invoice_number: invoiceNumber },
  });

  return { ok: true, id: invoiceId, invoiceNumber };
}

export type ArAgingRow = {
  customerId: string;
  customerName: string;
  current: number;
  overdue1to30: number;
  overdue31to60: number;
  overdue61to90: number;
  overdue90plus: number;
  total: number;
};

/** Mirrors getApAgingReport in vendor-bill-payments.ts — every open (unpaid) invoice,
 * bucketed by how overdue it is against its due date, grouped by customer. */
export async function getArAgingReport(service: SupabaseClient, tenantId: string): Promise<ArAgingRow[]> {
  const { data } = await service
    .schema("hotel")
    .from("customer_invoices")
    .select("customer_id,total,due_date,invoice_date,ar_customers(name)")
    .eq("tenant_id", tenantId)
    .eq("status", "open");

  const rows = (data ?? []) as {
    customer_id: string;
    total: number;
    due_date: string | null;
    invoice_date: string;
    ar_customers: { name: string } | { name: string }[] | null;
  }[];
  const now = Date.now();
  const byCustomer = new Map<string, ArAgingRow>();

  for (const r of rows) {
    const embed = r.ar_customers;
    const c = Array.isArray(embed) ? embed[0] : embed;
    const dueDate = r.due_date ?? r.invoice_date;
    const daysOverdue = Math.floor((now - new Date(dueDate).getTime()) / 86_400_000);
    const total = Number(r.total) || 0;

    const existing: ArAgingRow = byCustomer.get(r.customer_id) ?? {
      customerId: r.customer_id,
      customerName: c?.name ?? "Unknown customer",
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

    byCustomer.set(r.customer_id, existing);
  }

  return [...byCustomer.values()].sort((a, b) => b.total - a.total);
}
