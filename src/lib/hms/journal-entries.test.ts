import { describe, expect, it } from "vitest";
import { getTrialBalance, postJournalEntry, reverseJournalEntry } from "./journal-entries";

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
      lte: () => chain,
      limit: () => chain,
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

const BASE_PARAMS = { tenantId: "t1", entryDate: "2026-07-29", createdBy: "user-1" };

describe("postJournalEntry — validation (rejected before any database call)", () => {
  it("requires a memo", async () => {
    const { service } = createMockService();
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "  ",
      lines: [
        { accountId: "a", debit: 100, credit: 0 },
        { accountId: "b", debit: 0, credit: 100 },
      ],
    });
    expect(result).toEqual({ ok: false, error: "Memo is required." });
  });

  it("requires at least two lines", async () => {
    const { service } = createMockService();
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Single line",
      lines: [{ accountId: "a", debit: 100, credit: 0 }],
    });
    expect(result).toEqual({ ok: false, error: "A journal entry needs at least two lines." });
  });

  it("rejects a line with both a debit and a credit", async () => {
    const { service } = createMockService();
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Bad line",
      lines: [
        { accountId: "a", debit: 100, credit: 100 },
        { accountId: "b", debit: 0, credit: 100 },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error: "Each line must have either a debit or a credit, not both or neither.",
    });
  });

  it("rejects a line with neither a debit nor a credit", async () => {
    const { service } = createMockService();
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Empty line",
      lines: [
        { accountId: "a", debit: 0, credit: 0 },
        { accountId: "b", debit: 0, credit: 100 },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error: "Each line must have either a debit or a credit, not both or neither.",
    });
  });

  it("rejects negative amounts", async () => {
    const { service } = createMockService();
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Negative",
      lines: [
        { accountId: "a", debit: -100, credit: 0 },
        { accountId: "b", debit: 0, credit: 100 },
      ],
    });
    expect(result).toEqual({ ok: false, error: "Amounts cannot be negative." });
  });

  it("rejects an entry where debits and credits don't balance", async () => {
    const { service } = createMockService();
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Unbalanced",
      lines: [
        { accountId: "a", debit: 100, credit: 0 },
        { accountId: "b", debit: 0, credit: 90 },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error: "Entry does not balance — debits 100.00 vs credits 90.00.",
    });
  });

  it("accepts an entry within the rounding tolerance", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: [{ id: "a", is_active: true }, { id: "b", is_active: true }], error: null }],
      journal_entries: [{ data: { id: "je-1" }, error: null }],
      journal_entry_lines: [{ data: null, error: null }],
    });
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Within tolerance",
      lines: [
        { accountId: "a", debit: 100, credit: 0 },
        { accountId: "b", debit: 0, credit: 100.005 },
      ],
    });
    expect(result).toEqual({ ok: true, id: "je-1" });
  });
});

describe("postJournalEntry — account checks", () => {
  it("rejects a line referencing an account that doesn't exist", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: [{ id: "a", is_active: true }], error: null }],
    });
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Missing account",
      lines: [
        { accountId: "a", debit: 100, credit: 0 },
        { accountId: "does-not-exist", debit: 0, credit: 100 },
      ],
    });
    expect(result).toEqual({ ok: false, error: "One or more accounts were not found." });
  });

  it("rejects posting to an inactive account", async () => {
    const { service } = createMockService({
      chart_of_accounts: [
        { data: [{ id: "a", is_active: true }, { id: "b", is_active: false }], error: null },
      ],
    });
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Inactive account",
      lines: [
        { accountId: "a", debit: 100, credit: 0 },
        { accountId: "b", debit: 0, credit: 100 },
      ],
    });
    expect(result).toEqual({ ok: false, error: "Cannot post to an inactive account." });
  });
});

describe("postJournalEntry — happy path", () => {
  it("posts the entry and its lines, returning the new id", async () => {
    const { service, calls } = createMockService({
      chart_of_accounts: [
        { data: [{ id: "acct-cash", is_active: true }, { id: "acct-revenue", is_active: true }], error: null },
      ],
      journal_entries: [{ data: { id: "je-1" }, error: null }],
      journal_entry_lines: [{ data: null, error: null }],
    });
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Cash sale",
      lines: [
        { accountId: "acct-cash", debit: 100, credit: 0 },
        { accountId: "acct-revenue", debit: 0, credit: 100 },
      ],
    });
    expect(result).toEqual({ ok: true, id: "je-1" });
    expect(calls.some((c) => c.table === "journal_entries" && c.op === "insert")).toBe(true);
    expect(calls.some((c) => c.table === "journal_entry_lines" && c.op === "insert")).toBe(true);
  });

  it("rolls back the entry header if the line insert fails", async () => {
    const { service, calls } = createMockService({
      chart_of_accounts: [
        { data: [{ id: "acct-cash", is_active: true }, { id: "acct-revenue", is_active: true }], error: null },
      ],
      journal_entries: [{ data: { id: "je-2" }, error: null }],
      journal_entry_lines: [{ data: null, error: { message: "lines insert failed" } }],
    });
    const result = await postJournalEntry(service, {
      ...BASE_PARAMS,
      memo: "Will fail on lines",
      lines: [
        { accountId: "acct-cash", debit: 100, credit: 0 },
        { accountId: "acct-revenue", debit: 0, credit: 100 },
      ],
    });
    expect(result).toEqual({ ok: false, error: "lines insert failed" });
    expect(calls.some((c) => c.table === "journal_entries" && c.op === "delete")).toBe(true);
  });
});

describe("reverseJournalEntry", () => {
  it("refuses to reverse an entry that was already reversed", async () => {
    const { service } = createMockService({
      journal_entries: [
        {
          data: {
            id: "je-orig",
            entry_date: "2026-07-01",
            memo: "Original entry",
            reference: null,
            reversed_of: null,
            reversed_by: "je-already-reversed",
            created_at: "2026-07-01T00:00:00Z",
          },
          error: null,
        },
      ],
      journal_entry_lines: [
        {
          data: [
            {
              id: "l1",
              account_id: "acct-cash",
              department: null,
              description: null,
              debit: 50,
              credit: 0,
              line_no: 0,
              chart_of_accounts: { code: "1000", name: "Cash on Hand" },
            },
          ],
          error: null,
        },
      ],
    });
    const result = await reverseJournalEntry(service, {
      tenantId: "t1",
      journalEntryId: "je-orig",
      actorUserId: "user-1",
    });
    expect(result).toEqual({ ok: false, error: "This entry has already been reversed." });
  });

  it("creates a reversal with debit and credit swapped, and links both entries", async () => {
    const { service, calls } = createMockService({
      journal_entries: [
        {
          data: {
            id: "je-orig",
            entry_date: "2026-07-01",
            memo: "Original entry",
            reference: null,
            reversed_of: null,
            reversed_by: null,
            created_at: "2026-07-01T00:00:00Z",
          },
          error: null,
        },
        { data: { id: "je-rev" }, error: null },
      ],
      journal_entry_lines: [
        {
          data: [
            {
              id: "l1",
              account_id: "acct-cash",
              department: "Front Desk",
              description: "Cash in",
              debit: 100,
              credit: 0,
              line_no: 0,
              chart_of_accounts: { code: "1000", name: "Cash on Hand" },
            },
            {
              id: "l2",
              account_id: "acct-revenue",
              department: null,
              description: null,
              debit: 0,
              credit: 100,
              line_no: 1,
              chart_of_accounts: { code: "4000", name: "Room Revenue" },
            },
          ],
          error: null,
        },
      ],
      chart_of_accounts: [
        { data: [{ id: "acct-cash", is_active: true }, { id: "acct-revenue", is_active: true }], error: null },
      ],
    });

    const result = await reverseJournalEntry(service, {
      tenantId: "t1",
      journalEntryId: "je-orig",
      actorUserId: "user-1",
    });

    expect(result).toEqual({ ok: true, id: "je-rev" });

    const linesInsert = calls.find((c) => c.table === "journal_entry_lines" && c.op === "insert");
    const insertedLines = linesInsert?.payload as { account_id: string; debit: number; credit: number }[];
    expect(insertedLines.find((l) => l.account_id === "acct-cash")).toMatchObject({ debit: 0, credit: 100 });
    expect(insertedLines.find((l) => l.account_id === "acct-revenue")).toMatchObject({ debit: 100, credit: 0 });

    const entryInsert = calls.find((c) => c.table === "journal_entries" && c.op === "insert");
    expect((entryInsert?.payload as { memo: string }).memo).toBe("Reversal of: Original entry");

    const updates = calls.filter((c) => c.table === "journal_entries" && c.op === "update");
    expect(updates).toContainEqual({ table: "journal_entries", op: "update", payload: { reversed_of: "je-orig" } });
    expect(updates).toContainEqual({ table: "journal_entries", op: "update", payload: { reversed_by: "je-rev" } });
  });
});

describe("getTrialBalance", () => {
  it("returns an empty list when the chart of accounts is empty", async () => {
    const { service } = createMockService({ chart_of_accounts: [{ data: [], error: null }] });
    const result = await getTrialBalance(service, "t1");
    expect(result).toEqual([]);
  });

  it("signs balances by each account's normal-balance direction", async () => {
    const { service } = createMockService({
      chart_of_accounts: [
        {
          data: [
            { id: "a-cash", code: "1000", name: "Cash on Hand", type: "asset" },
            { id: "a-rev", code: "4000", name: "Room Revenue", type: "revenue" },
          ],
          error: null,
        },
      ],
      journal_entry_lines: [
        {
          data: [
            { account_id: "a-cash", debit: 500, credit: 200 },
            { account_id: "a-rev", debit: 0, credit: 300 },
          ],
          error: null,
        },
      ],
    });
    const result = await getTrialBalance(service, "t1");
    const cash = result.find((r) => r.code === "1000");
    const revenue = result.find((r) => r.code === "4000");
    expect(cash).toMatchObject({ debit: 500, credit: 200, balance: 300 });
    expect(revenue).toMatchObject({ debit: 0, credit: 300, balance: 300 });
  });

  it("returns every account at a zero balance when nothing has posted by the given date", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: [{ id: "a-cash", code: "1000", name: "Cash on Hand", type: "asset" }], error: null }],
      journal_entries: [{ data: [], error: null }],
    });
    const result = await getTrialBalance(service, "t1", { asOfDate: "2026-01-01" });
    expect(result).toEqual([
      { accountId: "a-cash", code: "1000", name: "Cash on Hand", type: "asset", debit: 0, credit: 0, balance: 0 },
    ]);
  });
});
