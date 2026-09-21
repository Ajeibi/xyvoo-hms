import { describe, expect, it } from "vitest";
import {
  addManualStatementLine,
  completeBankReconciliation,
  createBankReconciliation,
  getBankReconciliation,
  getSuggestedMatches,
  importStatementLines,
  matchStatementLine,
  reopenBankReconciliation,
  unmatchLine,
} from "./bank-reconciliation";

type CannedResponse = { data: unknown; error: unknown };
type CallRecord = { table: string; op: string; payload?: unknown };

function createMockService(responses: Record<string, CannedResponse[]> = {}) {
  const calls: CallRecord[] = [];

  function makeChain(table: string) {
    const queue = responses[table];
    const response: CannedResponse = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
    const chain: Record<string, unknown> = {
      select: (cols?: string) => {
        // .select() chained after update/delete asks for the affected rows back — return them.
        void cols;
        return chain;
      },
      eq: () => chain,
      in: () => chain,
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return chain;
      },
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload });
        return chain;
      },
      delete: () => {
        calls.push({ table, op: "delete" });
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

describe("createBankReconciliation", () => {
  it("rejects an account that isn't cash-equivalent", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: { id: "a1", is_cash_equivalent: false }, error: null }],
    });
    const result = await createBankReconciliation(service, {
      tenantId: "t1",
      accountId: "a1",
      periodEndDate: "2026-09-30",
      statementEndingBalance: 1000,
      createdBy: "u1",
    });
    expect(result).toEqual({ ok: false, error: "Only bank/cash accounts can be reconciled." });
  });

  it("creates a reconciliation for a cash-equivalent account", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: { id: "a1", is_cash_equivalent: true }, error: null }],
      bank_reconciliations: [{ data: { id: "recon-1" }, error: null }],
    });
    const result = await createBankReconciliation(service, {
      tenantId: "t1",
      accountId: "a1",
      periodEndDate: "2026-09-30",
      statementEndingBalance: 1000,
      createdBy: "u1",
    });
    expect(result).toEqual({ ok: true, id: "recon-1" });
  });
});

describe("importStatementLines (P2 fix — bank reconciliation)", () => {
  it("de-dupes exact repeats already present in this reconciliation", async () => {
    const { service, calls } = createMockService({
      bank_reconciliation_lines: [
        { data: [{ line_date: "2026-09-01", amount: 100, description: "Deposit" }], error: null },
      ],
    });
    const result = await importStatementLines(service, {
      tenantId: "t1",
      reconciliationId: "recon-1",
      rows: [
        { lineDate: "2026-09-01", description: "Deposit", amount: 100, reference: null }, // duplicate
        { lineDate: "2026-09-02", description: "Withdrawal", amount: -50, reference: null }, // new
      ],
    });
    expect(result).toEqual({ ok: true, inserted: 1, duplicates: 1 });
    const insert = calls.find((c) => c.table === "bank_reconciliation_lines" && c.op === "insert");
    const rows = insert?.payload as { description: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Withdrawal");
  });
});

describe("addManualStatementLine", () => {
  it("reports a friendly error when the identical line already exists", async () => {
    const { service } = createMockService({
      bank_reconciliation_lines: [{ data: [{ line_date: "2026-09-01", amount: 100, description: "Deposit" }], error: null }],
    });
    const result = await addManualStatementLine(service, {
      tenantId: "t1",
      reconciliationId: "recon-1",
      lineDate: "2026-09-01",
      description: "Deposit",
      amount: 100,
    });
    expect(result).toEqual({ ok: false, error: "An identical line already exists on this reconciliation." });
  });
});

describe("getBankReconciliation (balance/completion math)", () => {
  it("matches the hand-walkthrough: $1000 open + $500 cleared deposit − $200 outstanding check = $1500 cleared balance", async () => {
    const { service } = createMockService({
      bank_reconciliations: [
        {
          data: {
            id: "recon-1",
            account_id: "a-cash",
            period_end_date: "2026-09-30",
            statement_ending_balance: 1500,
            status: "in_progress",
            final_difference: null,
            created_by: "u1",
            completed_by: null,
            completed_at: null,
            created_at: "2026-09-01T00:00:00Z",
          },
          error: null,
        },
      ],
      bank_reconciliation_lines: [{ data: [], error: null }], // no statement lines needed for this balance check
      chart_of_accounts: [{ data: [{ id: "a-cash", code: "1000", name: "Cash", type: "asset", is_cash_equivalent: true }], error: null }],
      journal_entries: [{ data: [{ id: "je-1" }], error: null }], // getTrialBalance's asOfDate entries lookup
      journal_entry_lines: [
        { data: [{ account_id: "a-cash", debit: 1500, credit: 200 }], error: null }, // getTrialBalance's lines (book balance = 1300)
        {
          data: [
            {
              id: "jl-check",
              debit: 0,
              credit: 200,
              department: null,
              journal_entries: { entry_date: "2026-09-28", memo: "Outstanding check" },
            },
          ],
          error: null,
        }, // all journal lines on this account up to period end, for the outstanding-items calc
      ],
      bank_reconciliation_matches: [{ data: [], error: null }], // no matches at all — the check is unmatched
    });

    const result = await getBankReconciliation(service, "t1", "recon-1");
    expect(result?.bookBalance).toBe(1300);
    expect(result?.clearedBookBalance).toBe(1500);
    expect(result?.difference).toBe(0);
    expect(result?.balanced).toBe(true);
    expect(result?.unmatchedJournalLines).toHaveLength(1);
  });
});

describe("getSuggestedMatches", () => {
  it("ranks an exact date+amount match first", async () => {
    const { service } = createMockService({
      bank_reconciliation_lines: [{ data: { id: "line-1", reconciliation_id: "recon-1", line_date: "2026-09-10", amount: 500 }, error: null }],
      bank_reconciliations: [{ data: { account_id: "a-cash" }, error: null }],
      journal_entries: [{ data: [], error: null }], // not used directly — embedded join is opaque to the mock
      journal_entry_lines: [
        {
          data: [
            { id: "jl-close", debit: 500, credit: 0, journal_entries: { entry_date: "2026-09-12", memo: "Close but not exact" } },
            { id: "jl-exact", debit: 500, credit: 0, journal_entries: { entry_date: "2026-09-10", memo: "Exact match" } },
          ],
          error: null,
        },
      ],
      bank_reconciliation_matches: [{ data: [], error: null }],
    });

    const result = await getSuggestedMatches(service, "t1", "line-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates[0]).toMatchObject({ journalEntryLineId: "jl-exact", exact: true });
      expect(result.candidates.find((c) => c.journalEntryLineId === "jl-close")).toMatchObject({ exact: false });
    }
  });
});

describe("matchStatementLine", () => {
  it("accepts a many-to-one selection that sums to the statement line's amount", async () => {
    const { service, calls } = createMockService({
      bank_reconciliation_lines: [{ data: { id: "line-1", amount: 300, reconciliation_id: "recon-1" }, error: null }],
      bank_reconciliations: [{ data: { status: "in_progress" }, error: null }],
      journal_entry_lines: [{ data: [{ id: "jl-1", debit: 200, credit: 0 }, { id: "jl-2", debit: 100, credit: 0 }], error: null }],
      bank_reconciliation_matches: [{ data: null, error: null }],
    });
    const result = await matchStatementLine(service, "t1", {
      reconciliationLineId: "line-1",
      journalEntryLineIds: ["jl-1", "jl-2"],
      matchedBy: "u1",
    });
    expect(result).toEqual({ ok: true });
    const insert = calls.find((c) => c.table === "bank_reconciliation_matches" && c.op === "insert");
    expect((insert?.payload as unknown[])).toHaveLength(2);
  });

  it("rejects a selection that doesn't sum to the statement line's amount", async () => {
    const { service } = createMockService({
      bank_reconciliation_lines: [{ data: { id: "line-1", amount: 300, reconciliation_id: "recon-1" }, error: null }],
      bank_reconciliations: [{ data: { status: "in_progress" }, error: null }],
      journal_entry_lines: [{ data: [{ id: "jl-1", debit: 200, credit: 0 }], error: null }],
    });
    const result = await matchStatementLine(service, "t1", {
      reconciliationLineId: "line-1",
      journalEntryLineIds: ["jl-1"],
      matchedBy: "u1",
    });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/doesn't match/);
  });

  it("refuses to match against a completed reconciliation", async () => {
    const { service } = createMockService({
      bank_reconciliation_lines: [{ data: { id: "line-1", amount: 300, reconciliation_id: "recon-1" }, error: null }],
      bank_reconciliations: [{ data: { status: "completed" }, error: null }],
    });
    const result = await matchStatementLine(service, "t1", {
      reconciliationLineId: "line-1",
      journalEntryLineIds: ["jl-1"],
      matchedBy: "u1",
    });
    expect(result).toEqual({ ok: false, error: "This reconciliation is completed — reopen it first." });
  });

  it("surfaces a friendly error when a transaction was already matched elsewhere (unique-violation)", async () => {
    const { service } = createMockService({
      bank_reconciliation_lines: [{ data: { id: "line-1", amount: 200, reconciliation_id: "recon-1" }, error: null }],
      bank_reconciliations: [{ data: { status: "in_progress" }, error: null }],
      journal_entry_lines: [{ data: [{ id: "jl-1", debit: 200, credit: 0 }], error: null }],
      bank_reconciliation_matches: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
    });
    const result = await matchStatementLine(service, "t1", {
      reconciliationLineId: "line-1",
      journalEntryLineIds: ["jl-1"],
      matchedBy: "u1",
    });
    expect(result).toEqual({
      ok: false,
      error: "One or more of these transactions were already matched elsewhere — refresh and try again.",
    });
  });
});

describe("unmatchLine", () => {
  it("refuses to unmatch on a completed reconciliation", async () => {
    const { service } = createMockService({
      bank_reconciliation_lines: [{ data: { id: "line-1", reconciliation_id: "recon-1" }, error: null }],
      bank_reconciliations: [{ data: { status: "completed" }, error: null }],
    });
    const result = await unmatchLine(service, "t1", "line-1");
    expect(result).toEqual({ ok: false, error: "This reconciliation is completed — reopen it first." });
  });
});

describe("reopenBankReconciliation", () => {
  it("errors when nothing was completed to reopen", async () => {
    const { service } = createMockService({
      bank_reconciliations: [{ data: [], error: null }],
    });
    const result = await reopenBankReconciliation(service, "t1", "recon-1");
    expect(result).toEqual({ ok: false, error: "Reconciliation not found, or it isn't completed." });
  });
});

describe("completeBankReconciliation", () => {
  it("requires confirmImbalance when the reconciliation doesn't balance", async () => {
    const { service } = createMockService({
      bank_reconciliations: [
        {
          data: {
            id: "recon-1",
            account_id: "a-cash",
            period_end_date: "2026-09-30",
            statement_ending_balance: 1500,
            status: "in_progress",
            final_difference: null,
            created_by: "u1",
            completed_by: null,
            completed_at: null,
            created_at: "2026-09-01T00:00:00Z",
          },
          error: null,
        },
      ],
      bank_reconciliation_lines: [{ data: [], error: null }],
      chart_of_accounts: [{ data: [{ id: "a-cash", code: "1000", name: "Cash", type: "asset", is_cash_equivalent: true }], error: null }],
      journal_entries: [{ data: [{ id: "je-1" }], error: null }],
      journal_entry_lines: [
        { data: [{ account_id: "a-cash", debit: 1000, credit: 0 }], error: null }, // book balance = 1000, statement says 1500
        { data: [], error: null }, // no outstanding items
      ],
      bank_reconciliation_matches: [{ data: [], error: null }],
    });

    const result = await completeBankReconciliation(service, "t1", { id: "recon-1", completedBy: "u1" });
    expect(result.ok).toBe(false);
    expect((result as { difference: number }).difference).toBe(500);
  });
});
