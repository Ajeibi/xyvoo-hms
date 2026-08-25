import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/front-desk-ops", () => ({
  writeAuditLog: vi.fn(),
  emitNotification: vi.fn(),
}));

import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { createReceiptRun } from "./customer-invoice-payments";

afterEach(() => {
  vi.mocked(writeAuditLog).mockClear();
  vi.mocked(emitNotification).mockClear();
});

type CannedResponse = { data: unknown; error: unknown };
type CallRecord = { table: string; op: string; payload?: unknown };

function createMockService(responses: Record<string, CannedResponse[]> = {}) {
  const calls: CallRecord[] = [];

  function makeChain(table: string) {
    const queue = responses[table];
    const response: CannedResponse = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return chain;
      },
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload });
        return chain;
      },
      maybeSingle: () => Promise.resolve(response),
      single: () => Promise.resolve(response),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve),
    };
    return chain;
  }

  const service = {
    schema: () => ({ from: (table: string) => makeChain(table) }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { service, calls };
}

const BASE_PARAMS = {
  tenantId: "t1",
  paymentDate: "2026-08-04",
  bankAccountId: "acct-bank",
  invoiceIds: ["inv-1", "inv-2"],
  createdBy: "user-1",
};

describe("createReceiptRun — validation", () => {
  it("requires at least one invoice", async () => {
    const { service } = createMockService();
    const result = await createReceiptRun(service, { ...BASE_PARAMS, invoiceIds: [] });
    expect(result).toEqual({ ok: false, error: "Select at least one invoice to receive.", paidInvoiceIds: [] });
  });

  it("rejects when the depositing account doesn't exist", async () => {
    const { service } = createMockService({ chart_of_accounts: [{ data: null, error: null }] });
    const result = await createReceiptRun(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Bank/cash account not found.", paidInvoiceIds: [] });
  });

  it("rejects when the depositing account is inactive", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: { id: "acct-bank", is_active: false }, error: null }],
    });
    const result = await createReceiptRun(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Cannot deposit into an inactive account.", paidInvoiceIds: [] });
  });

  it("rejects when an invoice isn't open", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: { id: "acct-bank", is_active: true }, error: null }],
      customer_invoices: [
        {
          data: [
            { id: "inv-1", status: "open", department: "Front Desk", total: 500, invoice_number: "INV-1", ar_account_id: "acct-ar" },
            { id: "inv-2", status: "paid", department: "Front Desk", total: 300, invoice_number: "INV-2", ar_account_id: "acct-ar" },
          ],
          error: null,
        },
      ],
    });
    const result = await createReceiptRun(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Only open, unpaid invoices can be received.", paidInvoiceIds: [] });
  });
});

describe("createReceiptRun — happy path", () => {
  it("posts one journal entry per invoice, using each invoice's own AR account, and marks each paid", async () => {
    const { service, calls } = createMockService({
      chart_of_accounts: [
        { data: { id: "acct-bank", is_active: true }, error: null },
        { data: [{ id: "acct-bank", is_active: true }, { id: "acct-city-ledger", is_active: true }], error: null },
        { data: [{ id: "acct-bank", is_active: true }, { id: "acct-ar-generic", is_active: true }], error: null },
      ],
      customer_invoices: [
        {
          data: [
            {
              id: "inv-1",
              status: "open",
              department: "Front Desk",
              total: 500,
              invoice_number: "INV-1",
              invoice_date: "2026-08-01",
              ar_account_id: "acct-city-ledger",
            },
            {
              id: "inv-2",
              status: "open",
              department: "Front Desk",
              total: 300,
              invoice_number: "INV-2",
              invoice_date: "2026-08-01",
              ar_account_id: "acct-ar-generic",
            },
          ],
          error: null,
        },
      ],
      customer_invoice_payments: [{ data: { id: "receipt-1" }, error: null }],
      journal_entries: [{ data: { id: "je-1" }, error: null }, { data: { id: "je-2" }, error: null }],
    });

    const result = await createReceiptRun(service, BASE_PARAMS);

    expect(result).toEqual({ ok: true, id: "receipt-1", paidInvoiceIds: ["inv-1", "inv-2"] });

    const lineInserts = calls.filter((c) => c.table === "journal_entry_lines" && c.op === "insert");
    expect(lineInserts).toHaveLength(2);

    const invoice1Lines = lineInserts[0].payload as { account_id: string; debit: number; credit: number }[];
    expect(invoice1Lines.find((l) => l.account_id === "acct-bank")).toMatchObject({ debit: 500, credit: 0 });
    expect(invoice1Lines.find((l) => l.account_id === "acct-city-ledger")).toMatchObject({ debit: 0, credit: 500 });

    const invoice2Lines = lineInserts[1].payload as { account_id: string; debit: number; credit: number }[];
    expect(invoice2Lines.find((l) => l.account_id === "acct-bank")).toMatchObject({ debit: 300, credit: 0 });
    expect(invoice2Lines.find((l) => l.account_id === "acct-ar-generic")).toMatchObject({ debit: 0, credit: 300 });

    const statusUpdates = calls.filter(
      (c) => c.table === "customer_invoices" && c.op === "update" && (c.payload as { status?: string }).status === "paid",
    );
    expect(statusUpdates).toHaveLength(2);

    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "customer_invoice_payment_run_created" }));
    expect(emitNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "customer_invoice_payment_recorded" }));
  });
});
