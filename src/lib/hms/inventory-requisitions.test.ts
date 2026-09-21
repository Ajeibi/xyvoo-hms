import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/inventory-stock", () => ({
  postStockMovement: vi.fn(),
  findFixedAssetItem: vi.fn(),
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

import { findFixedAssetItem, postStockMovement, resolveInventoryItemDisplay } from "@/lib/hms/inventory-stock";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { postJournalEntry } from "@/lib/hms/journal-entries";
import { issueRequisition } from "./inventory-requisitions";

afterEach(() => {
  vi.mocked(postStockMovement).mockReset();
  vi.mocked(findFixedAssetItem).mockReset();
  vi.mocked(resolveInventoryItemDisplay).mockReset();
  vi.mocked(getAccountIdByCode).mockReset();
  vi.mocked(postJournalEntry).mockReset();
});

type CannedResponse = { data: unknown; error: unknown };

function createMockService(responses: Record<string, CannedResponse[]> = {}) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];

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

function requisitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    tenant_id: "t1",
    requisition_number: "REQ-1",
    requesting_department: "Kitchen",
    from_location_id: "loc-1",
    status: "approved",
    requested_by: "user-1",
    approved_by: "user-2",
    notes: null,
    created_at: "2026-09-18T00:00:00Z",
    updated_at: "2026-09-18T00:00:00Z",
    ...overrides,
  };
}

function requisitionLineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "line-1",
    tenant_id: "t1",
    requisition_id: "req-1",
    item_id: "item-1",
    qty_requested: 10,
    qty_issued: 0,
    created_at: "2026-09-18T00:00:00Z",
    ...overrides,
  };
}

function itemDisplayMap() {
  return new Map([["item-1", { name: "Flour", sku: "SKU1", unit_of_measure: "kg", unit_cost: 5 }]]);
}

describe("issueRequisition — GL auto-posting", () => {
  it("hard-fails before any stock movement when a required account is missing", async () => {
    vi.mocked(findFixedAssetItem).mockResolvedValue(null);
    vi.mocked(resolveInventoryItemDisplay).mockResolvedValue(itemDisplayMap());
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce(null); // 5000 missing
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");

    const { service } = createMockService({
      inventory_requisitions: [{ data: requisitionRow(), error: null }],
      inventory_requisition_lines: [{ data: [requisitionLineRow()], error: null }],
      inventory_locations: [{ data: [{ id: "loc-1", name: "Main Store" }], error: null }],
    });

    const result = await issueRequisition(service, "t1", "req-1", "user-3", [{ lineId: "line-1", qtyIssued: 10 }]);

    expect(result).toEqual({ error: "Missing required accounts: Cost of Goods Sold (5000)." });
    expect(postStockMovement).not.toHaveBeenCalled();
    expect(postJournalEntry).not.toHaveBeenCalled();
  });

  it("posts one Dr COGS / Cr Inventory entry for the value actually issued, tagged with the requesting department", async () => {
    vi.mocked(findFixedAssetItem).mockResolvedValue(null);
    vi.mocked(resolveInventoryItemDisplay).mockResolvedValue(itemDisplayMap());
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-cogs");
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    vi.mocked(postStockMovement).mockResolvedValue({
      error: null,
      movement: { id: "mv-1", unit_cost_at_movement: 5 } as never,
      qtyOnHand: 90,
    });
    vi.mocked(postJournalEntry).mockResolvedValue({ ok: true, id: "je-1" });

    const { service } = createMockService({
      inventory_requisitions: [
        { data: requisitionRow(), error: null },
        { data: requisitionRow(), error: null },
        { data: { id: "req-1" }, error: null },
      ],
      inventory_requisition_lines: [
        { data: [requisitionLineRow()], error: null },
        { data: [requisitionLineRow({ qty_issued: 10 })], error: null },
      ],
      inventory_locations: [
        { data: [{ id: "loc-1", name: "Main Store" }], error: null },
        { data: [{ id: "loc-1", name: "Main Store" }], error: null },
      ],
    });

    const result = await issueRequisition(service, "t1", "req-1", "user-3", [{ lineId: "line-1", qtyIssued: 10 }]);

    expect(result).toEqual({ error: null });
    expect(postJournalEntry).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        tenantId: "t1",
        reference: "req-1",
        lines: [
          { accountId: "acct-cogs", department: "Kitchen", debit: 50, credit: 0 },
          { accountId: "acct-inventory", department: "Kitchen", debit: 0, credit: 50 },
        ],
      }),
    );
  });

  it("normalizes an unrecognized requesting department to Other on the journal line", async () => {
    vi.mocked(findFixedAssetItem).mockResolvedValue(null);
    vi.mocked(resolveInventoryItemDisplay).mockResolvedValue(itemDisplayMap());
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-cogs");
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    vi.mocked(postStockMovement).mockResolvedValue({
      error: null,
      movement: { id: "mv-1", unit_cost_at_movement: 5 } as never,
      qtyOnHand: 90,
    });
    vi.mocked(postJournalEntry).mockResolvedValue({ ok: true, id: "je-1" });

    const { service } = createMockService({
      inventory_requisitions: [
        { data: requisitionRow({ requesting_department: "Room Service" }), error: null },
        { data: requisitionRow({ requesting_department: "Room Service" }), error: null },
        { data: { id: "req-1" }, error: null },
      ],
      inventory_requisition_lines: [
        { data: [requisitionLineRow()], error: null },
        { data: [requisitionLineRow({ qty_issued: 10 })], error: null },
      ],
      inventory_locations: [
        { data: [{ id: "loc-1", name: "Main Store" }], error: null },
        { data: [{ id: "loc-1", name: "Main Store" }], error: null },
      ],
    });

    await issueRequisition(service, "t1", "req-1", "user-3", [{ lineId: "line-1", qtyIssued: 10 }]);

    expect(postJournalEntry).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        lines: [
          expect.objectContaining({ department: "Other" }),
          expect.objectContaining({ department: "Other" }),
        ],
      }),
    );
  });

  it("posts nothing when nothing is actually issued (already fully issued lines)", async () => {
    vi.mocked(findFixedAssetItem).mockResolvedValue(null);
    vi.mocked(resolveInventoryItemDisplay).mockResolvedValue(itemDisplayMap());

    const { service } = createMockService({
      inventory_requisitions: [
        { data: requisitionRow({ status: "partially_issued" }), error: null },
        { data: requisitionRow({ status: "partially_issued" }), error: null },
        { data: { id: "req-1" }, error: null },
      ],
      inventory_requisition_lines: [
        { data: [requisitionLineRow({ qty_issued: 10 })], error: null },
        { data: [requisitionLineRow({ qty_issued: 10 })], error: null },
      ],
      inventory_locations: [
        { data: [{ id: "loc-1", name: "Main Store" }], error: null },
        { data: [{ id: "loc-1", name: "Main Store" }], error: null },
      ],
    });

    const result = await issueRequisition(service, "t1", "req-1", "user-3", [{ lineId: "line-1", qtyIssued: 10 }]);

    expect(result).toEqual({ error: null });
    expect(postStockMovement).not.toHaveBeenCalled();
    expect(getAccountIdByCode).not.toHaveBeenCalled();
    expect(postJournalEntry).not.toHaveBeenCalled();
  });
});
