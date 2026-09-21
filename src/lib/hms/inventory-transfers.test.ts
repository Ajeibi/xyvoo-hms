import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/inventory-stock", () => ({
  findFixedAssetItem: vi.fn(async () => null),
  postStockMovement: vi.fn(async () => ({ error: null })),
  resolveInventoryItemDisplay: vi.fn(async () => new Map()),
}));

import { postStockMovement } from "@/lib/hms/inventory-stock";
import { cancelTransfer } from "./inventory-transfers";

afterEach(() => {
  vi.mocked(postStockMovement).mockClear();
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

function transferRow(status: string) {
  return {
    id: "transfer-1",
    tenant_id: "t1",
    transfer_number: "TRF-1",
    from_location_id: "loc-a",
    to_location_id: "loc-b",
    status,
    initiated_by: "user-1",
    received_by: null,
    notes: null,
    created_at: "2026-08-14T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z",
  };
}

describe("cancelTransfer — reachability + reversal fix (P2)", () => {
  it("errors when the transfer doesn't exist", async () => {
    const { service } = createMockService({ inventory_transfers: [{ data: null, error: null }] });
    const result = await cancelTransfer(service, "t1", "transfer-1", "user-2");
    expect(result).toEqual({ error: "Transfer not found." });
  });

  it("refuses a transfer that's already completed or cancelled", async () => {
    const { service } = createMockService({ inventory_transfers: [{ data: transferRow("completed"), error: null }] });
    const result = await cancelTransfer(service, "t1", "transfer-1", "user-2");
    expect(result).toEqual({ error: "Only a pending or in-transit transfer can be cancelled." });
    expect(postStockMovement).not.toHaveBeenCalled();
  });

  it("cancels a pending transfer without reversing any stock (none was ever moved)", async () => {
    const { service } = createMockService({ inventory_transfers: [{ data: transferRow("pending"), error: null }] });
    const result = await cancelTransfer(service, "t1", "transfer-1", "user-2");
    expect(result).toEqual({ error: null });
    expect(postStockMovement).not.toHaveBeenCalled();
  });

  it("cancelling an in-transit transfer reverses stock back to the source location — the actual fix", async () => {
    const { service, calls } = createMockService({
      inventory_transfers: [{ data: transferRow("in_transit"), error: null }],
      inventory_transfer_lines: [{ data: [{ id: "line-1", item_id: "item-1", qty: 5, transfer_id: "transfer-1" }], error: null }],
    });

    const result = await cancelTransfer(service, "t1", "transfer-1", "user-2");

    expect(result).toEqual({ error: null });
    expect(postStockMovement).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        tenantId: "t1",
        itemId: "item-1",
        locationId: "loc-a", // reversed back to the source, not the destination
        movementType: "transfer_in",
        qty: 5,
        relatedLocationId: "loc-b",
        performedBy: "user-2",
      }),
    );
    const statusUpdate = calls.find((c) => c.table === "inventory_transfers" && c.op === "update");
    expect(statusUpdate?.payload).toMatchObject({ status: "cancelled" });
  });

  it("does not cancel if reversing the stock movement fails", async () => {
    vi.mocked(postStockMovement).mockResolvedValueOnce({ error: "Insufficient stock to reverse.", movement: null, qtyOnHand: null });
    const { service, calls } = createMockService({
      inventory_transfers: [{ data: transferRow("in_transit"), error: null }],
      inventory_transfer_lines: [{ data: [{ id: "line-1", item_id: "item-1", qty: 5, transfer_id: "transfer-1" }], error: null }],
    });

    const result = await cancelTransfer(service, "t1", "transfer-1", "user-2");

    expect(result).toEqual({ error: "Insufficient stock to reverse." });
    expect(calls.find((c) => c.table === "inventory_transfers" && c.op === "update")).toBeUndefined();
  });
});
