import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/front-desk-ops", () => ({
  writeAuditLog: vi.fn(),
  emitNotification: vi.fn(),
}));

import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { computeNightAuditBreakdown, runNightAudit } from "./night-audit";

afterEach(() => {
  vi.mocked(writeAuditLog).mockClear();
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
      neq: () => chain,
      is: () => chain,
      gte: () => chain,
      lt: () => chain,
      order: () => chain,
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return chain;
      },
      upsert: (payload: unknown) => {
        calls.push({ table, op: "upsert", payload });
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

const VALID_ACCOUNTS: CannedResponse[] = [
  { data: { id: "acct-room" }, error: null },
  { data: { id: "acct-fb" }, error: null },
  { data: { id: "acct-other" }, error: null },
  { data: { id: "acct-misc" }, error: null },
  { data: { id: "acct-cash" }, error: null },
  { data: { id: "acct-card" }, error: null },
  { data: { id: "acct-cityledger" }, error: null },
  { data: { id: "acct-guestledger" }, error: null },
];

describe("computeNightAuditBreakdown", () => {
  it("buckets folio charges/discounts/refunds by department, payments by method, and folds in walk-in F&B", async () => {
    const { service } = createMockService({
      folio_transactions: [
        {
          data: [
            { kind: "charge", amount: 1000, method: "system", department: "rooms" },
            { kind: "charge", amount: 500, method: "system", department: "food_beverage" },
            { kind: "discount", amount: 50, method: "system", department: "food_beverage" },
            { kind: "charge", amount: 200, method: "system", department: "housekeeping" },
            { kind: "charge", amount: 80, method: "system", department: null },
            { kind: "payment", amount: -600, method: "cash", department: null },
            { kind: "payment", amount: -300, method: "card", department: null },
            { kind: "payment", amount: -100, method: "direct_bill", department: null },
            { kind: "payment", amount: -25, method: "system", department: null },
            { kind: "transfer", amount: 9999, method: "system", department: "rooms" },
          ],
          error: null,
        },
      ],
      fb_orders: [{ data: [{ subtotal: 150, settlement_method: "cash" }], error: null }],
    });

    const b = await computeNightAuditBreakdown(service, "t1", "2026-08-05");

    expect(b.roomRevenue).toBe(1000);
    expect(b.fbRevenue).toBeCloseTo(450 + 150); // folio (500-50) + walk-in 150
    expect(b.otherRevenue).toBe(200);
    expect(b.unclassifiedRevenue).toBe(80);
    expect(b.cashTotal).toBe(600 + 150); // folio cash + walk-in cash
    expect(b.cardTotal).toBe(300);
    expect(b.cityLedgerTotal).toBe(100);
    expect(b.unmatchedPaymentTotal).toBe(25);
    expect(b.guestLedgerNet).toBeCloseTo(1000 + 450 + 200 + 80 - (600 + 300 + 100)); // 730
    expect(b.folioLineCount).toBe(10);
    expect(b.walkInFbOrderCount).toBe(1);
  });

  it("returns all zeros when nothing happened that day", async () => {
    const { service } = createMockService({
      folio_transactions: [{ data: [], error: null }],
      fb_orders: [{ data: [], error: null }],
    });
    const b = await computeNightAuditBreakdown(service, "t1", "2026-08-05");
    expect(b).toMatchObject({ roomRevenue: 0, fbRevenue: 0, otherRevenue: 0, unclassifiedRevenue: 0, guestLedgerNet: 0 });
  });
});

describe("runNightAudit — guards", () => {
  it("refuses to redo a date that was already audited and not reversed", async () => {
    const { service } = createMockService({
      night_audit_runs: [{ data: { id: "run-1", journal_entry_id: "je-old" }, error: null }],
      journal_entries: [{ data: { id: "je-old", reversed_by: null }, error: null }],
    });
    const result = await runNightAudit(service, { tenantId: "t1", auditDate: "2026-08-05", createdBy: "user-1" });
    expect(result).toEqual({
      ok: false,
      error: "2026-08-05 was already audited. Reverse its journal entry first to redo it.",
    });
  });

  it("reports exactly which control account is missing", async () => {
    const accountsWithOneMissing = [...VALID_ACCOUNTS];
    accountsWithOneMissing[3] = { data: null, error: null }; // misc income (4300), 4th lookup
    const { service } = createMockService({ chart_of_accounts: accountsWithOneMissing });
    const result = await runNightAudit(service, { tenantId: "t1", auditDate: "2026-08-05", createdBy: "user-1" });
    expect(result).toEqual({ ok: false, error: "Missing required accounts: Miscellaneous Income (4300)." });
  });

  it("refuses to post an empty entry when there was no activity", async () => {
    const { service } = createMockService({
      chart_of_accounts: [...VALID_ACCOUNTS],
      folio_transactions: [{ data: [], error: null }],
      fb_orders: [{ data: [], error: null }],
    });
    const result = await runNightAudit(service, { tenantId: "t1", auditDate: "2026-08-05", createdBy: "user-1" });
    expect(result).toEqual({ ok: false, error: "Nothing to post for 2026-08-05 — no folio or F&B activity found." });
  });
});

describe("runNightAudit — happy path", () => {
  it("posts a balanced entry and records the run", async () => {
    const { service, calls } = createMockService({
      chart_of_accounts: [
        ...VALID_ACCOUNTS,
        // postJournalEntry's own account-existence re-check (room + cash only referenced below)
        { data: [{ id: "acct-room", is_active: true }, { id: "acct-cash", is_active: true }], error: null },
      ],
      folio_transactions: [
        { data: [{ kind: "charge", amount: 1000, method: "system", department: "rooms" }, { kind: "payment", amount: -1000, method: "cash", department: null }], error: null },
      ],
      fb_orders: [{ data: [], error: null }],
      journal_entries: [{ data: { id: "je-1" }, error: null }],
      night_audit_runs: [{ data: null, error: null }, { data: { id: "run-new" }, error: null }],
    });

    const result = await runNightAudit(service, { tenantId: "t1", auditDate: "2026-08-05", createdBy: "user-1" });

    expect(result).toMatchObject({ ok: true, id: "run-new", journalEntryId: "je-1" });

    const linesInsert = calls.find((c) => c.table === "journal_entry_lines" && c.op === "insert");
    const lines = linesInsert?.payload as { debit: number; credit: number }[];
    const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
    expect(totalDebit).toBeCloseTo(totalCredit);
    expect(totalDebit).toBeCloseTo(1000);

    const runUpsert = calls.find((c) => c.table === "night_audit_runs" && c.op === "upsert");
    expect((runUpsert?.payload as { room_revenue: number }).room_revenue).toBe(1000);

    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "night_audit_run" }));
  });
});
