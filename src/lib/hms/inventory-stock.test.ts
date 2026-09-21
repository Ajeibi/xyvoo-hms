import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/chart-of-accounts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hms/chart-of-accounts")>("@/lib/hms/chart-of-accounts");
  return { ...actual, getAccountIdByCode: vi.fn() };
});
vi.mock("@/lib/hms/journal-entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hms/journal-entries")>("@/lib/hms/journal-entries");
  return { ...actual, postJournalEntry: vi.fn() };
});

import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { postJournalEntry } from "@/lib/hms/journal-entries";
import { recordWaste } from "./inventory-stock";

afterEach(() => {
  vi.mocked(getAccountIdByCode).mockReset();
  vi.mocked(postJournalEntry).mockReset();
});

type CannedResponse = { data: unknown; error: unknown };

function createMockService(responses: Record<string, CannedResponse[]> = {}) {
  function makeChain(table: string) {
    const queue = responses[table];
    const response: CannedResponse = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      gte: () => chain,
      limit: () => chain,
      order: () => chain,
      insert: () => chain,
      update: () => chain,
      maybeSingle: () => Promise.resolve(response),
      single: () => Promise.resolve(response),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve),
    };
    return chain;
  }

  const service = {
    schema: () => ({ from: (table: string) => makeChain(table) }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { service };
}

describe("recordWaste — GL auto-posting", () => {
  it("fails before any stock movement when a required account is missing", async () => {
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce(null); // 5010 missing
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    const { service } = createMockService();

    const result = await recordWaste(service, {
      tenantId: "t1",
      itemId: "item-1",
      locationId: "loc-1",
      qty: 2,
      reason: "Spoiled",
      performedBy: "user-1",
    });

    expect(result).toEqual({
      error: "Missing required accounts: Inventory Shrinkage & Adjustments (5010).",
      movement: null,
      qtyOnHand: null,
    });
    expect(postJournalEntry).not.toHaveBeenCalled();
  });

  it("posts Dr Shrinkage / Cr Inventory for the wasted quantity's value, referencing the stock movement", async () => {
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-shrinkage");
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    vi.mocked(postJournalEntry).mockResolvedValue({ ok: true, id: "je-1" });

    const { service } = createMockService({
      inventory_items: [{ data: { name: "Milk", item_type: null, unit_cost: 5 }, error: null }],
      inventory_stock_levels: [{ data: { id: "lvl-1", qty_on_hand: 20, reorder_point: 0 }, error: null }],
      inventory_stock_movements: [{ data: { id: "mv-1", unit_cost_at_movement: 5, qty: -2 }, error: null }],
    });

    const result = await recordWaste(service, {
      tenantId: "t1",
      itemId: "item-1",
      locationId: "loc-1",
      qty: 2,
      reason: "Spoiled",
      performedBy: "user-1",
      department: "Kitchen",
    });

    expect(result.error).toBeNull();
    expect(postJournalEntry).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        tenantId: "t1",
        reference: "mv-1",
        lines: [
          { accountId: "acct-shrinkage", department: "Kitchen", debit: 10, credit: 0 },
          { accountId: "acct-inventory", department: "Kitchen", debit: 0, credit: 10 },
        ],
      }),
    );
  });

  it("defaults to department Other when none is provided", async () => {
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-shrinkage");
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    vi.mocked(postJournalEntry).mockResolvedValue({ ok: true, id: "je-1" });

    const { service } = createMockService({
      inventory_items: [{ data: { name: "Milk", item_type: null, unit_cost: 5 }, error: null }],
      inventory_stock_levels: [{ data: { id: "lvl-1", qty_on_hand: 20, reorder_point: 0 }, error: null }],
      inventory_stock_movements: [{ data: { id: "mv-1", unit_cost_at_movement: 5, qty: -2 }, error: null }],
    });

    await recordWaste(service, {
      tenantId: "t1",
      itemId: "item-1",
      locationId: "loc-1",
      qty: 2,
      reason: "Spoiled",
      performedBy: "user-1",
    });

    expect(postJournalEntry).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        lines: [expect.objectContaining({ department: "Other" }), expect.objectContaining({ department: "Other" })],
      }),
    );
  });
});
