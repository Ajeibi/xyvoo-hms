import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/front-desk-ops", () => ({
  writeAuditLog: vi.fn(),
  emitNotification: vi.fn(),
}));

import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { createCustomerInvoice, getArAgingReport } from "./customer-invoices";

afterEach(() => {
  vi.mocked(writeAuditLog).mockClear();
});

type CannedResponse = { data: unknown; error: unknown; count?: number };
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

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const BASE_PARAMS = {
  tenantId: "t1",
  customerId: "cust-1",
  department: "Front Desk",
  invoiceDate: "2026-08-04",
  currency: "NGN",
  revenueAccountId: "acct-revenue",
  arAccountId: "acct-ar",
  subtotal: 1000,
  createdBy: "user-1",
};

describe("createCustomerInvoice — validation", () => {
  it("rejects when the customer doesn't exist", async () => {
    const { service } = createMockService({ ar_customers: [{ data: null, error: null }] });
    const result = await createCustomerInvoice(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Customer not found." });
  });

  it("rejects when the revenue account doesn't exist", async () => {
    const { service } = createMockService({
      ar_customers: [{ data: { id: "cust-1" }, error: null }],
      chart_of_accounts: [{ data: null, error: null }],
    });
    const result = await createCustomerInvoice(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Revenue account not found." });
  });

  it("rejects when the revenue account is inactive", async () => {
    const { service } = createMockService({
      ar_customers: [{ data: { id: "cust-1" }, error: null }],
      chart_of_accounts: [{ data: { id: "acct-revenue", is_active: false }, error: null }],
    });
    const result = await createCustomerInvoice(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Cannot post to an inactive account." });
  });

  it("rejects a zero or negative total", async () => {
    const { service } = createMockService({
      ar_customers: [{ data: { id: "cust-1" }, error: null }],
      chart_of_accounts: [{ data: { id: "acct-revenue", is_active: true }, error: null }],
    });
    const result = await createCustomerInvoice(service, { ...BASE_PARAMS, subtotal: 0, tax: 0 });
    expect(result).toEqual({ ok: false, error: "Invoice total must be greater than zero." });
  });
});

describe("createCustomerInvoice — happy path", () => {
  it("assigns a sequential invoice number, posts Dr AR / Cr revenue, and returns the new id", async () => {
    const { service, calls } = createMockService({
      ar_customers: [{ data: { id: "cust-1" }, error: null }],
      chart_of_accounts: [
        { data: { id: "acct-revenue", is_active: true }, error: null },
        { data: [{ id: "acct-ar", is_active: true }, { id: "acct-revenue", is_active: true }], error: null },
      ],
      customer_invoices: [{ data: null, error: null, count: 4 }, { data: { id: "inv-1" }, error: null }],
      journal_entries: [{ data: { id: "je-1" }, error: null }],
    });

    const result = await createCustomerInvoice(service, BASE_PARAMS);

    expect(result).toEqual({ ok: true, id: "inv-1", invoiceNumber: "INV-00005" });

    const linesInsert = calls.find((c) => c.table === "journal_entry_lines" && c.op === "insert");
    const insertedLines = linesInsert?.payload as { account_id: string; debit: number; credit: number }[];
    expect(insertedLines.find((l) => l.account_id === "acct-ar")).toMatchObject({ debit: 1000, credit: 0 });
    expect(insertedLines.find((l) => l.account_id === "acct-revenue")).toMatchObject({ debit: 0, credit: 1000 });

    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "customer_invoice_created" }));
  });
});

describe("getArAgingReport", () => {
  it("buckets invoices by how overdue they are, grouped by customer", async () => {
    const { service } = createMockService({
      customer_invoices: [
        {
          data: [
            { customer_id: "c1", total: 100, due_date: daysAgo(-5), invoice_date: "2026-07-01", ar_customers: { name: "Acme Corp" } },
            { customer_id: "c1", total: 200, due_date: daysAgo(45), invoice_date: "2026-06-01", ar_customers: { name: "Acme Corp" } },
            { customer_id: "c2", total: 50, due_date: daysAgo(120), invoice_date: "2026-04-01", ar_customers: { name: "Globex Travel" } },
          ],
          error: null,
        },
      ],
    });

    const rows = await getArAgingReport(service, "t1");

    const acme = rows.find((r) => r.customerId === "c1");
    const globex = rows.find((r) => r.customerId === "c2");

    expect(acme).toMatchObject({ current: 100, overdue31to60: 200, total: 300 });
    expect(globex).toMatchObject({ overdue90plus: 50, total: 50 });
  });

  it("returns an empty list when nothing is outstanding", async () => {
    const { service } = createMockService({ customer_invoices: [{ data: [], error: null }] });
    const rows = await getArAgingReport(service, "t1");
    expect(rows).toEqual([]);
  });
});
