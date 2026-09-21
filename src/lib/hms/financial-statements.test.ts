import { describe, expect, it } from "vitest";
import { getAccountLedger, getBalanceSheet, getCashFlowStatement, getIncomeStatement } from "./financial-statements";

type CannedResponse = { data: unknown; error: unknown };

function createMockService(responses: Record<string, CannedResponse[]> = {}) {
  function makeChain(table: string) {
    const queue = responses[table];
    const response: CannedResponse = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      lte: () => chain,
      gte: () => chain,
      maybeSingle: () => Promise.resolve(response),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve),
    };
    return chain;
  }

  const service = {
    schema: () => ({ from: (table: string) => makeChain(table) }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { service };
}

const ACCOUNTS = [
  { id: "a-cash", code: "1000", name: "Cash on Hand", type: "asset", is_cash_equivalent: true },
  { id: "a-fixed", code: "1500", name: "Fixed Assets", type: "asset", is_cash_equivalent: false, cash_flow_category: "investing" },
  { id: "a-accdep", code: "1590", name: "Accumulated Depreciation", type: "asset", is_cash_equivalent: false },
  { id: "l-ap", code: "2000", name: "Accounts Payable", type: "liability", is_cash_equivalent: false },
  { id: "e-owner", code: "3000", name: "Owner's Equity", type: "equity", is_cash_equivalent: false, cash_flow_category: "financing" },
  { id: "r-room", code: "4000", name: "Room Revenue", type: "revenue", is_cash_equivalent: false },
  { id: "x-dep", code: "5700", name: "Depreciation Expense", type: "expense", is_cash_equivalent: false },
];

describe("getIncomeStatement", () => {
  it("aggregates revenue and expense for the range only, netting to income", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: ACCOUNTS, error: null }],
      journal_entries: [{ data: [{ id: "je-1" }], error: null }],
      journal_entry_lines: [
        {
          data: [
            { account_id: "r-room", debit: 0, credit: 1000 },
            { account_id: "x-dep", debit: 200, credit: 0 },
          ],
          error: null,
        },
      ],
    });
    const result = await getIncomeStatement(service, "t1", { dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    expect(result.totalRevenue).toBe(1000);
    expect(result.totalExpense).toBe(200);
    expect(result.netIncome).toBe(800);
  });
});

describe("getBalanceSheet", () => {
  it("balances once unclosed net income is folded into equity", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: ACCOUNTS, error: null }],
      journal_entries: [{ data: [{ id: "je-1" }], error: null }],
      journal_entry_lines: [
        {
          data: [
            { account_id: "a-cash", debit: 1000, credit: 0 },
            { account_id: "r-room", debit: 0, credit: 1000 },
          ],
          error: null,
        },
      ],
    });
    const result = await getBalanceSheet(service, "t1", { asOfDate: "2026-09-30" });
    expect(result.netIncomeSinceLastClose).toBe(1000);
    expect(result.totalAssets).toBe(1000);
    expect(result.totalLiabilitiesAndEquity).toBe(1000);
    expect(result.balanced).toBe(true);
  });

  it("flags an out-of-balance sheet instead of hiding it", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: ACCOUNTS, error: null }],
      journal_entries: [{ data: [{ id: "je-1" }], error: null }],
      journal_entry_lines: [{ data: [{ account_id: "a-cash", debit: 1000, credit: 0 }], error: null }],
    });
    const result = await getBalanceSheet(service, "t1", { asOfDate: "2026-09-30" });
    expect(result.balanced).toBe(false);
  });
});

/**
 * getCashFlowStatement makes 3 sequential getTrialBalance calls under the hood — via
 * getIncomeStatement (range), then start-of-period and end-of-period asOfDate snapshots (in
 * that order, since Promise.all still invokes and advances each async call in array order up to
 * its first await). getTrialBalance short-circuits (no journal_entry_lines query at all) when its
 * journal_entries query comes back empty, so an empty period must NOT queue a lines response for
 * that step, or a later step will consume it by mistake. Each fixture below is queued in exactly
 * that call order.
 */
describe("getCashFlowStatement (P1 fix — financial statements)", () => {
  it("excludes revenue/expense accounts from the reconciliation loop (regression: no double-counting)", async () => {
    // Nothing posted before the period; a single cash sale (Dr Cash, Cr Revenue) posts inside it.
    const { service } = createMockService({
      chart_of_accounts: [{ data: ACCOUNTS, error: null }, { data: ACCOUNTS, error: null }, { data: ACCOUNTS, error: null }],
      journal_entries: [
        { data: [{ id: "je-1" }], error: null }, // income statement's range query
        { data: [], error: null }, // start-of-period: nothing posted yet — short-circuits, no lines query follows
        { data: [{ id: "je-1" }], error: null }, // end-of-period
      ],
      journal_entry_lines: [
        {
          data: [
            { account_id: "a-cash", debit: 500, credit: 0 },
            { account_id: "r-room", debit: 0, credit: 500 },
          ],
          error: null,
        }, // income statement's lines
        {
          data: [
            { account_id: "a-cash", debit: 500, credit: 0 },
            { account_id: "r-room", debit: 0, credit: 500 },
          ],
          error: null,
        }, // end-of-period lines
      ],
    });

    const result = await getCashFlowStatement(service, "t1", { dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    expect(result.netIncome).toBe(500);
    expect(result.operatingTotal).toBe(500);
    expect(result.operatingItems.some((i) => i.code === "4000")).toBe(false);
    expect(result.reconciles).toBe(true);
  });

  it("buckets a fixed-asset purchase as investing and Accumulated Depreciation movement as operating", async () => {
    // Nothing posted before the period; a fixed-asset purchase with depreciation posts inside it:
    // Dr Fixed Assets 1000, Cr Accumulated Depreciation 100, Cr Cash 900.
    const { service } = createMockService({
      chart_of_accounts: [{ data: ACCOUNTS, error: null }, { data: ACCOUNTS, error: null }, { data: ACCOUNTS, error: null }],
      journal_entries: [
        { data: [{ id: "je-1" }], error: null }, // income statement's range query
        { data: [], error: null }, // start-of-period — short-circuits
        { data: [{ id: "je-1" }], error: null }, // end-of-period
      ],
      journal_entry_lines: [
        {
          data: [
            { account_id: "a-fixed", debit: 1000, credit: 0 },
            { account_id: "a-accdep", debit: 0, credit: 100 },
            { account_id: "a-cash", debit: 0, credit: 900 },
          ],
          error: null,
        }, // income statement's lines (none are revenue/expense — net income comes out 0)
        {
          data: [
            { account_id: "a-fixed", debit: 1000, credit: 0 },
            { account_id: "a-accdep", debit: 0, credit: 100 },
            { account_id: "a-cash", debit: 0, credit: 900 },
          ],
          error: null,
        }, // end-of-period lines
      ],
    });

    const result = await getCashFlowStatement(service, "t1", { dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    expect(result.investingItems).toContainEqual({ accountId: "a-fixed", code: "1500", name: "Fixed Assets", delta: -1000 });
    expect(result.operatingItems).toContainEqual({
      accountId: "a-accdep",
      code: "1590",
      name: "Accumulated Depreciation",
      delta: 100,
    });
    expect(result.reconciles).toBe(true);
  });
});

describe("getAccountLedger", () => {
  it("computes a running balance in date order", async () => {
    const { service } = createMockService({
      chart_of_accounts: [{ data: { id: "a-cash", code: "1000", name: "Cash on Hand", type: "asset" }, error: null }],
      journal_entries: [
        {
          data: [
            {
              id: "je-1",
              entry_date: "2026-09-05",
              memo: "Deposit",
              reference: null,
              reversed_of: null,
              reversed_by: null,
              created_at: "2026-09-05T09:00:00Z",
            },
            {
              id: "je-2",
              entry_date: "2026-09-10",
              memo: "Withdrawal",
              reference: null,
              reversed_of: null,
              reversed_by: null,
              created_at: "2026-09-10T09:00:00Z",
            },
          ],
          error: null,
        },
      ],
      journal_entry_lines: [
        {
          data: [
            { id: "l1", journal_entry_id: "je-1", department: null, description: null, debit: 100, credit: 0 },
            { id: "l2", journal_entry_id: "je-2", department: null, description: null, debit: 0, credit: 40 },
          ],
          error: null,
        },
      ],
    });

    // No dateFrom passed — keeps this test to a single getTrialBalance-free path (opening
    // balance defaults to 0) so it only exercises the ledger's own entries+lines queries.
    const result = await getAccountLedger(service, "t1", "a-cash", { dateTo: "2026-09-30" });
    expect(result?.openingBalance).toBe(0);
    expect(result?.lines.map((l) => l.runningBalance)).toEqual([100, 60]);
    expect(result?.closingBalance).toBe(60);
  });

  it("returns null for an account that doesn't exist in this tenant", async () => {
    const { service } = createMockService({ chart_of_accounts: [{ data: null, error: null }] });
    const result = await getAccountLedger(service, "t1", "missing");
    expect(result).toBeNull();
  });
});
