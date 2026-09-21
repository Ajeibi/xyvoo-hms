import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/inventory-stock", () => ({
  postStockMovement: vi.fn(),
  resolveInventoryItemDisplay: vi.fn(),
}));
vi.mock("@/lib/hms/chart-of-accounts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hms/chart-of-accounts")>("@/lib/hms/chart-of-accounts");
  return { ...actual, getAccountIdByCode: vi.fn() };
});
vi.mock("@/lib/hms/journal-entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hms/journal-entries")>("@/lib/hms/journal-entries");
  return { ...actual, postJournalEntry: vi.fn() };
});

import { postStockMovement, resolveInventoryItemDisplay } from "@/lib/hms/inventory-stock";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { postJournalEntry } from "@/lib/hms/journal-entries";
import { postStockCount } from "./inventory-counts";

afterEach(() => {
  vi.mocked(postStockMovement).mockReset();
  vi.mocked(resolveInventoryItemDisplay).mockReset();
  vi.mocked(getAccountIdByCode).mockReset();
  vi.mocked(postJournalEntry).mockReset();
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

function countRow(status: string) {
  return {
    id: "count-1",
    tenant_id: "t1",
    location_id: "loc-1",
    count_date: "2026-08-14",
    status,
    started_by: "user-1",
    posted_by: null,
    posted_at: null,
    notes: null,
    created_at: "2026-08-14T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z",
  };
}

describe("postStockCount — completion gate (P2 fix)", () => {
  it("rejects when the count doesn't exist", async () => {
    const { service } = createMockService({ inventory_stock_counts: [{ data: null, error: null }] });
    const result = await postStockCount(service, "t1", "count-1", "user-2");
    expect(result).toEqual({ error: "Stock count not found." });
  });

  it("rejects a count that's already posted", async () => {
    const { service } = createMockService({ inventory_stock_counts: [{ data: countRow("posted"), error: null }] });
    const result = await postStockCount(service, "t1", "count-1", "user-2");
    expect(result).toEqual({ error: "This count has already been posted." });
  });

  it("rejects a count that hasn't been marked completed yet (in_progress)", async () => {
    const { service } = createMockService({ inventory_stock_counts: [{ data: countRow("in_progress"), error: null }] });
    const result = await postStockCount(service, "t1", "count-1", "user-2");
    expect(result).toEqual({ error: "Only a completed count can be posted — finish counting every line first." });
  });

  it("rejects a count still in draft", async () => {
    const { service } = createMockService({ inventory_stock_counts: [{ data: countRow("draft"), error: null }] });
    const result = await postStockCount(service, "t1", "count-1", "user-2");
    expect(result).toEqual({ error: "Only a completed count can be posted — finish counting every line first." });
  });

  it("posts a completed count with no lines to reconcile", async () => {
    const { service } = createMockService({
      inventory_stock_counts: [
        { data: countRow("completed"), error: null },
        { data: { id: "count-1" }, error: null },
      ],
    });
    const result = await postStockCount(service, "t1", "count-1", "user-2");
    expect(result).toEqual({ error: null });
  });

  it("rejects when the race-safe status-flip update finds the count no longer completed", async () => {
    const { service } = createMockService({
      inventory_stock_counts: [
        { data: countRow("completed"), error: null },
        { data: null, error: null }, // update's .eq("status","completed") matched nothing
      ],
    });
    const result = await postStockCount(service, "t1", "count-1", "user-2");
    expect(result).toEqual({ error: "Could not mark this count as posted." });
  });
});

function countLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "line-1",
    tenant_id: "t1",
    count_id: "count-1",
    item_id: "item-a",
    system_qty: 10,
    counted_qty: 10,
    created_at: "2026-08-14T00:00:00Z",
    ...overrides,
  };
}

describe("postStockCount — GL auto-posting", () => {
  it("fails before any stock movement when a required account is missing and the net variance is nonzero", async () => {
    vi.mocked(resolveInventoryItemDisplay).mockResolvedValue(
      new Map([["item-a", { name: "Flour", sku: "SKU-A", unit_of_measure: "kg", unit_cost: 2 }]]),
    );
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce(null); // 5010 missing

    const { service } = createMockService({
      inventory_stock_counts: [{ data: countRow("completed"), error: null }],
      inventory_stock_count_lines: [{ data: [countLine({ counted_qty: 15 })], error: null }],
      inventory_locations: [{ data: [{ id: "loc-1", name: "Main Store" }], error: null }],
    });

    const result = await postStockCount(service, "t1", "count-1", "user-2");

    expect(result).toEqual({ error: "Missing required accounts: Inventory Shrinkage & Adjustments (5010)." });
    expect(postStockMovement).not.toHaveBeenCalled();
    expect(postJournalEntry).not.toHaveBeenCalled();
  });

  it("posts Dr Inventory / Cr Shrinkage for a net-positive variance (found more than expected)", async () => {
    vi.mocked(resolveInventoryItemDisplay).mockResolvedValue(
      new Map([
        ["item-a", { name: "Flour", sku: "SKU-A", unit_of_measure: "kg", unit_cost: 2 }],
        ["item-b", { name: "Sugar", sku: "SKU-B", unit_of_measure: "kg", unit_cost: 3 }],
      ]),
    );
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-shrinkage");
    vi.mocked(postStockMovement).mockResolvedValue({ error: null, movement: {} as never, qtyOnHand: 0 });
    vi.mocked(postJournalEntry).mockResolvedValue({ ok: true, id: "je-1" });

    const { service, calls } = createMockService({
      inventory_stock_counts: [
        { data: countRow("completed"), error: null },
        { data: { id: "count-1" }, error: null },
      ],
      inventory_stock_count_lines: [
        {
          data: [
            countLine({ id: "line-a", item_id: "item-a", system_qty: 10, counted_qty: 15 }), // +5 * 2 = +10
            countLine({ id: "line-b", item_id: "item-b", system_qty: 10, counted_qty: 8 }), // -2 * 3 = -6
          ],
          error: null,
        },
      ],
      inventory_locations: [{ data: [{ id: "loc-1", name: "Main Store" }], error: null }],
    });

    const result = await postStockCount(service, "t1", "count-1", "user-2");

    expect(result).toEqual({ error: null });
    expect(postStockMovement).toHaveBeenCalledTimes(2);
    expect(postJournalEntry).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        reference: "count-1",
        lines: [
          { accountId: "acct-inventory", department: "Other", debit: 4, credit: 0 },
          { accountId: "acct-shrinkage", department: "Other", debit: 0, credit: 4 },
        ],
      }),
    );
    // Regression: the posted JE's id must be stamped back onto the count row, not just posted
    // and forgotten — a real-data verification pass caught this being silently dropped.
    const statusFlip = calls.find((c) => c.table === "inventory_stock_counts" && c.op === "update");
    expect(statusFlip?.payload).toMatchObject({ status: "posted", journal_entry_id: "je-1" });
  });

  it("posts Dr Shrinkage / Cr Inventory for a net-negative variance (net shrinkage)", async () => {
    vi.mocked(resolveInventoryItemDisplay).mockResolvedValue(
      new Map([
        ["item-a", { name: "Flour", sku: "SKU-A", unit_of_measure: "kg", unit_cost: 2 }],
        ["item-b", { name: "Sugar", sku: "SKU-B", unit_of_measure: "kg", unit_cost: 3 }],
      ]),
    );
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-shrinkage");
    vi.mocked(postStockMovement).mockResolvedValue({ error: null, movement: {} as never, qtyOnHand: 0 });
    vi.mocked(postJournalEntry).mockResolvedValue({ ok: true, id: "je-1" });

    const { service } = createMockService({
      inventory_stock_counts: [
        { data: countRow("completed"), error: null },
        { data: { id: "count-1" }, error: null },
      ],
      inventory_stock_count_lines: [
        {
          data: [
            countLine({ id: "line-a", item_id: "item-a", system_qty: 10, counted_qty: 12 }), // +2 * 2 = +4
            countLine({ id: "line-b", item_id: "item-b", system_qty: 10, counted_qty: 6 }), // -4 * 3 = -12
          ],
          error: null,
        },
      ],
      inventory_locations: [{ data: [{ id: "loc-1", name: "Main Store" }], error: null }],
    });

    const result = await postStockCount(service, "t1", "count-1", "user-2");

    expect(result).toEqual({ error: null });
    expect(postJournalEntry).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        lines: [
          { accountId: "acct-shrinkage", department: "Other", debit: 8, credit: 0 },
          { accountId: "acct-inventory", department: "Other", debit: 0, credit: 8 },
        ],
      }),
    );
  });

  it("skips GL posting (but still posts the stock movements) when variances net to zero", async () => {
    vi.mocked(resolveInventoryItemDisplay).mockResolvedValue(
      new Map([
        ["item-a", { name: "Flour", sku: "SKU-A", unit_of_measure: "kg", unit_cost: 2 }],
        ["item-b", { name: "Sugar", sku: "SKU-B", unit_of_measure: "kg", unit_cost: 3 }],
      ]),
    );
    vi.mocked(postStockMovement).mockResolvedValue({ error: null, movement: {} as never, qtyOnHand: 0 });

    const { service, calls } = createMockService({
      inventory_stock_counts: [
        { data: countRow("completed"), error: null },
        { data: { id: "count-1" }, error: null },
      ],
      inventory_stock_count_lines: [
        {
          data: [
            countLine({ id: "line-a", item_id: "item-a", system_qty: 10, counted_qty: 13 }), // +3 * 2 = +6
            countLine({ id: "line-b", item_id: "item-b", system_qty: 10, counted_qty: 8 }), // -2 * 3 = -6
          ],
          error: null,
        },
      ],
      inventory_locations: [{ data: [{ id: "loc-1", name: "Main Store" }], error: null }],
    });

    const result = await postStockCount(service, "t1", "count-1", "user-2");

    expect(result).toEqual({ error: null });
    expect(postStockMovement).toHaveBeenCalledTimes(2);
    expect(getAccountIdByCode).not.toHaveBeenCalled();
    expect(postJournalEntry).not.toHaveBeenCalled();
    const statusFlip = calls.find((c) => c.table === "inventory_stock_counts" && c.op === "update");
    expect(statusFlip?.payload).toMatchObject({ status: "posted", journal_entry_id: null });
  });
});
