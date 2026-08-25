import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/front-desk-ops", () => ({
  writeAuditLog: vi.fn(),
  emitNotification: vi.fn(),
}));

import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { createPaymentRun, getApAgingReport } from "./vendor-bill-payments";

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

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const BASE_PARAMS = {
  tenantId: "t1",
  paymentDate: "2026-08-03",
  bankAccountId: "acct-bank",
  apAccountId: "acct-ap",
  billIds: ["bill-1", "bill-2"],
  createdBy: "user-1",
};

describe("createPaymentRun — validation", () => {
  it("requires at least one bill", async () => {
    const { service } = createMockService();
    const result = await createPaymentRun(service, { ...BASE_PARAMS, billIds: [] });
    expect(result).toEqual({ ok: false, error: "Select at least one bill to pay.", paidBillIds: [] });
  });

  it("rejects when the paying account doesn't exist", async () => {
    const { service } = createMockService({ chart_of_accounts: [{ data: null, error: null }] });
    const result = await createPaymentRun(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Bank/cash account not found.", paidBillIds: [] });
  });

  it("rejects when the paying account is inactive", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: { id: "acct-bank", is_active: false }, error: null }],
    });
    const result = await createPaymentRun(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Cannot pay from an inactive account.", paidBillIds: [] });
  });

  it("rejects when a selected bill wasn't found", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: { id: "acct-bank", is_active: true }, error: null }],
      vendor_bills: [{ data: [{ id: "bill-1", status: "approved", department: "Kitchen", total: 500 }], error: null }],
    });
    const result = await createPaymentRun(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "One or more bills were not found.", paidBillIds: [] });
  });

  it("rejects when a selected bill isn't approved", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: { id: "acct-bank", is_active: true }, error: null }],
      vendor_bills: [
        {
          data: [
            { id: "bill-1", status: "approved", department: "Kitchen", total: 500 },
            { id: "bill-2", status: "paid", department: "Bar", total: 300 },
          ],
          error: null,
        },
      ],
    });
    const result = await createPaymentRun(service, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Only approved, unpaid bills can be paid.", paidBillIds: [] });
  });
});

describe("createPaymentRun — happy path", () => {
  it("posts one journal entry per bill and marks each bill paid", async () => {
    const { service, calls } = createMockService({
      chart_of_accounts: [
        { data: { id: "acct-bank", is_active: true }, error: null },
        { data: [{ id: "acct-ap", is_active: true }, { id: "acct-bank", is_active: true }], error: null },
        { data: [{ id: "acct-ap", is_active: true }, { id: "acct-bank", is_active: true }], error: null },
      ],
      vendor_bills: [
        {
          data: [
            { id: "bill-1", status: "approved", department: "Kitchen", total: 500, bill_reference: "INV-1", bill_date: "2026-08-01" },
            { id: "bill-2", status: "approved", department: "Bar", total: 300, bill_reference: "INV-2", bill_date: "2026-08-01" },
          ],
          error: null,
        },
      ],
      vendor_bill_payments: [{ data: { id: "pay-1" }, error: null }],
      journal_entries: [{ data: { id: "je-1" }, error: null }, { data: { id: "je-2" }, error: null }],
    });

    const result = await createPaymentRun(service, BASE_PARAMS);

    expect(result).toEqual({ ok: true, id: "pay-1", paidBillIds: ["bill-1", "bill-2"] });

    const journalInserts = calls.filter((c) => c.table === "journal_entries" && c.op === "insert");
    expect(journalInserts).toHaveLength(2);

    const lineInserts = calls.filter((c) => c.table === "journal_entry_lines" && c.op === "insert");
    expect(lineInserts).toHaveLength(2);
    const bill1Lines = lineInserts[0].payload as { account_id: string; debit: number; credit: number }[];
    expect(bill1Lines.find((l) => l.account_id === "acct-ap")).toMatchObject({ debit: 500, credit: 0 });
    expect(bill1Lines.find((l) => l.account_id === "acct-bank")).toMatchObject({ debit: 0, credit: 500 });

    const statusUpdates = calls.filter(
      (c) => c.table === "vendor_bills" && c.op === "update" && (c.payload as { status?: string }).status === "paid",
    );
    expect(statusUpdates).toHaveLength(2);

    const paymentLineInserts = calls.filter((c) => c.table === "vendor_bill_payment_lines" && c.op === "insert");
    expect(paymentLineInserts).toHaveLength(2);

    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "vendor_bill_payment_run_created" }));
    expect(emitNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "vendor_bill_payment_recorded" }));
  });
});

describe("getApAgingReport", () => {
  it("buckets bills by how overdue they are, grouped by vendor", async () => {
    const { service } = createMockService({
      vendor_bills: [
        {
          data: [
            { vendor_id: "v1", total: 100, due_date: daysAgo(-5), bill_date: "2026-07-01", vendors: { name: "Acme Supplies" } },
            { vendor_id: "v1", total: 200, due_date: daysAgo(45), bill_date: "2026-06-01", vendors: { name: "Acme Supplies" } },
            { vendor_id: "v2", total: 50, due_date: daysAgo(120), bill_date: "2026-04-01", vendors: { name: "Global Foods" } },
          ],
          error: null,
        },
      ],
    });

    const rows = await getApAgingReport(service, "t1");

    const acme = rows.find((r) => r.vendorId === "v1");
    const global = rows.find((r) => r.vendorId === "v2");

    expect(acme).toMatchObject({ current: 100, overdue31to60: 200, total: 300 });
    expect(global).toMatchObject({ overdue90plus: 50, total: 50 });
  });

  it("returns an empty list when nothing is outstanding", async () => {
    const { service } = createMockService({ vendor_bills: [{ data: [], error: null }] });
    const rows = await getApAgingReport(service, "t1");
    expect(rows).toEqual([]);
  });
});
