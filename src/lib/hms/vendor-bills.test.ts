import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/front-desk-ops", () => ({
  writeAuditLog: vi.fn(),
  emitNotification: vi.fn(),
}));

vi.mock("@/lib/hms/journal-entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hms/journal-entries")>("@/lib/hms/journal-entries");
  return { ...actual, reverseJournalEntry: vi.fn() };
});

import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { reverseJournalEntry } from "@/lib/hms/journal-entries";
import { approveVendorBill, createVendorBill, getApAccountId, rejectVendorBill, voidVendorBill } from "./vendor-bills";

afterEach(() => {
  vi.mocked(writeAuditLog).mockClear();
  vi.mocked(emitNotification).mockClear();
  vi.mocked(reverseJournalEntry).mockClear();
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
      limit: () => chain,
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

const BASE_CREATE_PARAMS = {
  tenantId: "t1",
  vendorId: "vendor-1",
  department: "Kitchen",
  billDate: "2026-08-02",
  currency: "NGN",
  expenseAccountId: "acct-expense",
  apAccountId: "acct-ap",
  subtotal: 1000,
  createdBy: "user-1",
};

describe("createVendorBill — validation", () => {
  it("rejects when the vendor doesn't exist", async () => {
    const { service } = createMockService({ vendors: [{ data: null, error: null }] });
    const result = await createVendorBill(service, BASE_CREATE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Vendor not found." });
  });

  it("rejects when the expense account doesn't exist", async () => {
    const { service } = createMockService({
      vendors: [{ data: { id: "vendor-1" }, error: null }],
      chart_of_accounts: [{ data: null, error: null }],
    });
    const result = await createVendorBill(service, BASE_CREATE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Expense account not found." });
  });

  it("rejects when the expense account is inactive", async () => {
    const { service } = createMockService({
      vendors: [{ data: { id: "vendor-1" }, error: null }],
      chart_of_accounts: [{ data: { id: "acct-expense", is_active: false }, error: null }],
    });
    const result = await createVendorBill(service, BASE_CREATE_PARAMS);
    expect(result).toEqual({ ok: false, error: "Cannot post to an inactive account." });
  });

  it("rejects a zero or negative total", async () => {
    const { service } = createMockService({
      vendors: [{ data: { id: "vendor-1" }, error: null }],
      chart_of_accounts: [{ data: { id: "acct-expense", is_active: true }, error: null }],
    });
    const result = await createVendorBill(service, { ...BASE_CREATE_PARAMS, subtotal: 0, tax: 0 });
    expect(result).toEqual({ ok: false, error: "Bill total must be greater than zero." });
  });
});

describe("createVendorBill — threshold routing", () => {
  it("leaves the bill pending approval when no threshold auto-approves it, and notifies", async () => {
    const { service, calls } = createMockService({
      vendors: [{ data: { id: "vendor-1" }, error: null }],
      chart_of_accounts: [{ data: { id: "acct-expense", is_active: true }, error: null }],
      procurement_approval_thresholds: [{ data: [], error: null }],
      vendor_bills: [{ data: { id: "bill-1" }, error: null }],
    });

    const result = await createVendorBill(service, BASE_CREATE_PARAMS);

    expect(result).toEqual({ ok: true, id: "bill-1", status: "pending_approval", requiredApproverRole: "gm" });
    expect(calls.some((c) => c.table === "journal_entries" && c.op === "insert")).toBe(false);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "vendor_bill_created" }));
    expect(emitNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "vendor_bill_approval_needed" }));
  });

  it("auto-approves and posts to the ledger immediately when the amount is within an auto threshold", async () => {
    const { service, calls } = createMockService({
      vendors: [{ data: { id: "vendor-1" }, error: null }],
      chart_of_accounts: [
        { data: { id: "acct-expense", is_active: true }, error: null },
        { data: [{ id: "acct-expense", is_active: true }, { id: "acct-ap", is_active: true }], error: null },
      ],
      procurement_approval_thresholds: [
        {
          data: [
            {
              id: "th-1",
              tenant_id: "t1",
              department: "All departments",
              min_amount: 0,
              max_amount: null,
              approver_role: "auto",
              sort_order: 0,
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          error: null,
        },
      ],
      vendor_bills: [{ data: { id: "bill-2" }, error: null }],
      journal_entries: [{ data: { id: "je-1" }, error: null }],
    });

    const result = await createVendorBill(service, BASE_CREATE_PARAMS);

    expect(result).toEqual({ ok: true, id: "bill-2", status: "approved", requiredApproverRole: "auto" });

    const linesInsert = calls.find((c) => c.table === "journal_entry_lines" && c.op === "insert");
    const insertedLines = linesInsert?.payload as { account_id: string; debit: number; credit: number }[];
    expect(insertedLines.find((l) => l.account_id === "acct-expense")).toMatchObject({ debit: 1000, credit: 0 });
    expect(insertedLines.find((l) => l.account_id === "acct-ap")).toMatchObject({ debit: 0, credit: 1000 });

    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "vendor_bill_created" }));
    expect(emitNotification).not.toHaveBeenCalled();
  });
});

describe("approveVendorBill", () => {
  it("refuses to approve a bill that isn't pending approval", async () => {
    const { service } = createMockService({
      vendor_bills: [{ data: { id: "bill-1", status: "approved" }, error: null }],
    });
    const result = await approveVendorBill(service, {
      tenantId: "t1",
      billId: "bill-1",
      approvedBy: "user-1",
      apAccountId: "acct-ap",
    });
    expect(result).toEqual({ ok: false, error: "Only a bill awaiting approval can be approved (currently approved)." });
  });

  it("posts the ledger entry and marks the bill approved", async () => {
    const { service, calls } = createMockService({
      vendor_bills: [
        {
          data: {
            id: "bill-1",
            status: "pending_approval",
            department: "Kitchen",
            expense_account_id: "acct-expense",
            total: 500,
            bill_reference: "INV-42",
            bill_date: "2026-08-02",
          },
          error: null,
        },
      ],
      chart_of_accounts: [{ data: [{ id: "acct-expense", is_active: true }, { id: "acct-ap", is_active: true }], error: null }],
      journal_entries: [{ data: { id: "je-2" }, error: null }],
    });

    const result = await approveVendorBill(service, {
      tenantId: "t1",
      billId: "bill-1",
      approvedBy: "user-1",
      apAccountId: "acct-ap",
    });

    expect(result).toEqual({ ok: true });

    const linesInsert = calls.find((c) => c.table === "journal_entry_lines" && c.op === "insert");
    const insertedLines = linesInsert?.payload as { account_id: string; debit: number; credit: number }[];
    expect(insertedLines.find((l) => l.account_id === "acct-expense")).toMatchObject({ debit: 500, credit: 0 });
    expect(insertedLines.find((l) => l.account_id === "acct-ap")).toMatchObject({ debit: 0, credit: 500 });

    const statusUpdate = calls.find(
      (c) => c.table === "vendor_bills" && c.op === "update" && (c.payload as { status?: string }).status === "approved",
    );
    expect(statusUpdate).toBeTruthy();
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "vendor_bill_approved" }));
    expect(emitNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "vendor_bill_approved" }));
  });
});

describe("rejectVendorBill", () => {
  it("requires a reason", async () => {
    const { service } = createMockService();
    const result = await rejectVendorBill(service, { tenantId: "t1", billId: "bill-1", rejectedBy: "user-1", reason: "  " });
    expect(result).toEqual({ ok: false, error: "A reason is required to reject a bill." });
  });

  it("refuses to reject a bill that isn't pending approval", async () => {
    const { service } = createMockService({
      vendor_bills: [{ data: { id: "bill-1", status: "rejected" }, error: null }],
    });
    const result = await rejectVendorBill(service, { tenantId: "t1", billId: "bill-1", rejectedBy: "user-1", reason: "Duplicate" });
    expect(result).toEqual({ ok: false, error: "Only a bill awaiting approval can be rejected (currently rejected)." });
  });

  it("rejects a pending bill with the given reason", async () => {
    const { service, calls } = createMockService({
      vendor_bills: [{ data: { id: "bill-1", status: "pending_approval", department: "Kitchen", bill_reference: "INV-9" }, error: null }],
    });
    const result = await rejectVendorBill(service, {
      tenantId: "t1",
      billId: "bill-1",
      rejectedBy: "user-1",
      reason: "Wrong amount",
    });
    expect(result).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "vendor_bills" && c.op === "update");
    expect(update?.payload).toMatchObject({ status: "rejected", rejection_reason: "Wrong amount" });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "vendor_bill_rejected" }));
  });
});

describe("getApAccountId", () => {
  it("resolves the active code-2000 account", async () => {
    const { service } = createMockService({ chart_of_accounts: [{ data: { id: "acct-ap" }, error: null }] });
    const result = await getApAccountId(service, "t1");
    expect(result).toBe("acct-ap");
  });

  it("returns null when no active AP account exists", async () => {
    const { service } = createMockService({ chart_of_accounts: [{ data: null, error: null }] });
    const result = await getApAccountId(service, "t1");
    expect(result).toBeNull();
  });
});

describe("voidVendorBill", () => {
  it("refuses to void a bill that's still pending approval", async () => {
    const { service } = createMockService({
      vendor_bills: [{ data: { id: "bill-1", status: "pending_approval" }, error: null }],
    });
    const result = await voidVendorBill(service, { tenantId: "t1", billId: "bill-1", voidedBy: "user-1" });
    expect(result).toEqual({ ok: false, error: "This bill hasn't been posted yet — reject it instead of voiding." });
    expect(reverseJournalEntry).not.toHaveBeenCalled();
  });

  it("refuses to void a bill in any other non-approved status", async () => {
    const { service } = createMockService({
      vendor_bills: [{ data: { id: "bill-1", status: "cancelled" }, error: null }],
    });
    const result = await voidVendorBill(service, { tenantId: "t1", billId: "bill-1", voidedBy: "user-1" });
    expect(result).toEqual({ ok: false, error: "Only an approved (posted) bill can be voided (currently cancelled)." });
  });

  it("refuses to void an approved bill with no linked journal entry", async () => {
    const { service } = createMockService({
      vendor_bills: [{ data: { id: "bill-1", status: "approved", journal_entry_id: null }, error: null }],
    });
    const result = await voidVendorBill(service, { tenantId: "t1", billId: "bill-1", voidedBy: "user-1" });
    expect(result).toEqual({ ok: false, error: "This bill has no linked journal entry to reverse." });
  });

  it("refuses to void a bill that already has payments recorded", async () => {
    const { service } = createMockService({
      vendor_bills: [{ data: { id: "bill-1", status: "approved", journal_entry_id: "je-1" }, error: null }],
      vendor_bill_payment_lines: [{ data: [{ id: "pay-line-1" }], error: null }],
    });
    const result = await voidVendorBill(service, { tenantId: "t1", billId: "bill-1", voidedBy: "user-1" });
    expect(result).toEqual({ ok: false, error: "This bill has payments recorded against it — reverse the payments first." });
    expect(reverseJournalEntry).not.toHaveBeenCalled();
  });

  it("surfaces the reversal's own error instead of cancelling the bill", async () => {
    vi.mocked(reverseJournalEntry).mockResolvedValueOnce({ ok: false, error: "This entry has already been reversed." });
    const { service, calls } = createMockService({
      vendor_bills: [{ data: { id: "bill-1", status: "approved", journal_entry_id: "je-1" }, error: null }],
      vendor_bill_payment_lines: [{ data: [], error: null }],
    });
    const result = await voidVendorBill(service, { tenantId: "t1", billId: "bill-1", voidedBy: "user-1" });
    expect(result).toEqual({ ok: false, error: "This entry has already been reversed." });
    expect(calls.some((c) => c.table === "vendor_bills" && c.op === "update")).toBe(false);
  });

  it("reverses the journal entry and cancels the bill on the happy path", async () => {
    vi.mocked(reverseJournalEntry).mockResolvedValueOnce({ ok: true, id: "je-reversal-1" });
    const { service, calls } = createMockService({
      vendor_bills: [{ data: { id: "bill-1", status: "approved", journal_entry_id: "je-1", bill_reference: "GRN-ABC123" }, error: null }],
      vendor_bill_payment_lines: [{ data: [], error: null }],
    });
    const result = await voidVendorBill(service, { tenantId: "t1", billId: "bill-1", voidedBy: "user-1" });
    expect(result).toEqual({ ok: true });
    expect(reverseJournalEntry).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ tenantId: "t1", journalEntryId: "je-1", actorUserId: "user-1" }),
    );
    const update = calls.find((c) => c.table === "vendor_bills" && c.op === "update");
    expect(update?.payload).toMatchObject({ status: "cancelled" });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "vendor_bill_voided" }));
  });
});
