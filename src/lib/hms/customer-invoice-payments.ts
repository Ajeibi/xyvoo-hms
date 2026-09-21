import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { postJournalEntry } from "@/lib/hms/journal-entries";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Mirrors getAlreadyPaidByBillId in vendor-bill-payments.ts. */
export async function getAlreadyReceivedByInvoiceId(
  service: SupabaseClient,
  tenantId: string,
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const { data } = await service
    .schema("hotel")
    .from("customer_invoice_payment_lines")
    .select("customer_invoice_id,amount")
    .eq("tenant_id", tenantId)
    .in("customer_invoice_id", invoiceIds);
  const byInvoice = new Map<string, number>();
  for (const row of data ?? []) {
    const id = row.customer_invoice_id as string;
    byInvoice.set(id, (byInvoice.get(id) ?? 0) + (Number(row.amount) || 0));
  }
  return byInvoice;
}

/**
 * Receives payment against one or more already-open customer invoices in a single
 * batch. Each invoice still gets its own journal entry (Dr the paying bank/cash
 * account, Cr that invoice's own ar_account_id — City Ledger and generic Accounts
 * Receivable can differ per invoice, so the reversing leg must match what was
 * actually posted at invoice time, not a single fixed control account like vendor
 * bills' Accounts Payable). Mirrors createPaymentRun in vendor-bill-payments.ts,
 * including partial-payment support: omit `amount` to receive whatever remains.
 *
 * Not wrapped in a database transaction — same accepted limitation as the AP side.
 */
export async function createReceiptRun(
  service: SupabaseClient,
  params: {
    tenantId: string;
    paymentDate: string;
    bankAccountId: string;
    reference?: string | null;
    invoices: { invoiceId: string; amount?: number }[];
    createdBy: string;
  },
): Promise<{ ok: true; id: string; paidInvoiceIds: string[] } | { ok: false; error: string; paidInvoiceIds: string[] }> {
  if (params.invoices.length === 0) return { ok: false, error: "Select at least one invoice to receive.", paidInvoiceIds: [] };
  const invoiceIds = params.invoices.map((i) => i.invoiceId);

  const { data: bankAccount } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,is_active")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.bankAccountId)
    .maybeSingle();
  if (!bankAccount) return { ok: false, error: "Bank/cash account not found.", paidInvoiceIds: [] };
  if (!bankAccount.is_active) return { ok: false, error: "Cannot deposit into an inactive account.", paidInvoiceIds: [] };

  const { data: invoices } = await service
    .schema("hotel")
    .from("customer_invoices")
    .select("id,status,department,total,invoice_number,invoice_date,ar_account_id")
    .eq("tenant_id", params.tenantId)
    .in("id", invoiceIds);
  const invoiceRows = (invoices ?? []) as {
    id: string;
    status: string;
    department: string;
    total: number;
    invoice_number: string;
    invoice_date: string;
    ar_account_id: string;
  }[];

  if (invoiceRows.length !== invoiceIds.length) {
    return { ok: false, error: "One or more invoices were not found.", paidInvoiceIds: [] };
  }
  if (invoiceRows.some((i) => i.status !== "open")) {
    return { ok: false, error: "Only open, unpaid invoices can be received.", paidInvoiceIds: [] };
  }

  const alreadyReceivedByInvoice = await getAlreadyReceivedByInvoiceId(service, params.tenantId, invoiceIds);
  const amountByInvoice = new Map(params.invoices.map((i) => [i.invoiceId, i.amount]));

  const receiptPlans: { invoice: (typeof invoiceRows)[number]; amount: number; remaining: number }[] = [];
  for (const invoice of invoiceRows) {
    const invoiceTotal = round2(Number(invoice.total) || 0);
    const remaining = round2(invoiceTotal - (alreadyReceivedByInvoice.get(invoice.id) ?? 0));
    const requested = amountByInvoice.get(invoice.id);
    const amount = requested !== undefined ? round2(requested) : remaining;
    if (remaining <= 0) return { ok: false, error: `${invoice.invoice_number} is already fully received.`, paidInvoiceIds: [] };
    if (amount <= 0) return { ok: false, error: `Amount for ${invoice.invoice_number} must be greater than zero.`, paidInvoiceIds: [] };
    if (amount > remaining + 0.01) {
      return {
        ok: false,
        error: `Amount for ${invoice.invoice_number} (${amount}) exceeds the remaining balance (${remaining}).`,
        paidInvoiceIds: [],
      };
    }
    receiptPlans.push({ invoice, amount, remaining });
  }

  const total = round2(receiptPlans.reduce((sum, p) => sum + p.amount, 0));

  const { data: payment, error } = await service
    .schema("hotel")
    .from("customer_invoice_payments")
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
  if (error) return { ok: false, error: error.message, paidInvoiceIds: [] };
  const paymentId = payment.id as string;

  const paidInvoiceIds: string[] = [];
  for (const plan of receiptPlans) {
    const { invoice, amount, remaining } = plan;
    const posted = await postJournalEntry(service, {
      tenantId: params.tenantId,
      entryDate: params.paymentDate,
      memo: `Receipt of invoice ${invoice.invoice_number}`,
      reference: paymentId,
      createdBy: params.createdBy,
      lines: [
        { accountId: params.bankAccountId, department: invoice.department, debit: amount, credit: 0 },
        { accountId: invoice.ar_account_id, department: invoice.department, debit: 0, credit: amount },
      ],
    });
    if (!posted.ok) {
      return {
        ok: false,
        error: `Received ${paidInvoiceIds.length} of ${receiptPlans.length} invoices, then failed: ${posted.error}`,
        paidInvoiceIds,
      };
    }

    await service.schema("hotel").from("customer_invoice_payment_lines").insert({
      tenant_id: params.tenantId,
      payment_id: paymentId,
      customer_invoice_id: invoice.id,
      amount,
      journal_entry_id: posted.id,
    });
    if (round2(remaining - amount) <= 0) {
      await service.schema("hotel").from("customer_invoices").update({ status: "paid" }).eq("id", invoice.id);
    }
    paidInvoiceIds.push(invoice.id);
  }

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.createdBy,
    action: "customer_invoice_payment_run_created",
    entityType: "customer_invoice_payment",
    entityId: paymentId,
    after: { total, invoiceCount: invoiceRows.length },
  });
  await emitNotification({
    tenantId: params.tenantId,
    type: "customer_invoice_payment_recorded",
    title: "Customer payment received",
    body: `${invoiceRows.length} invoice(s) totaling ${total.toFixed(2)} were received.`,
    severity: "info",
    entityType: "customer_invoice_payment",
    entityId: paymentId,
  });

  return { ok: true, id: paymentId, paidInvoiceIds };
}
