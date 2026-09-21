import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/front-desk-ops", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/hms/notification-rules", () => ({ notifyGoodsReceivedDiscrepancy: vi.fn() }));
vi.mock("@/lib/hms/chart-of-accounts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hms/chart-of-accounts")>("@/lib/hms/chart-of-accounts");
  return { ...actual, getAccountIdByCode: vi.fn() };
});
vi.mock("@/lib/hms/vendor-bills", () => ({
  getApAccountId: vi.fn(),
  createVendorBill: vi.fn(),
}));

import { receiveAgainstPurchaseOrder } from "./procurement-receiving";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { createVendorBill, getApAccountId } from "@/lib/hms/vendor-bills";

afterEach(() => {
  vi.mocked(getAccountIdByCode).mockReset();
  vi.mocked(getApAccountId).mockReset();
  vi.mocked(createVendorBill).mockReset();
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

function poRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "po-1",
    po_number: "PO-1",
    vendor_id: "vendor-1",
    status: "ordered",
    currency: "NGN",
    fx_rate: 1,
    department: "Kitchen",
    ...overrides,
  };
}

function baseLine(overrides: Partial<Parameters<typeof receiveAgainstPurchaseOrder>[1]["lines"][number]> = {}) {
  return {
    purchaseOrderLineId: "line-1",
    itemId: "item-1",
    qtyReceived: 10,
    unitCost: 5,
    qtyRejected: 0,
    discrepancyType: "none" as const,
    qualityPassed: true,
    ...overrides,
  };
}

describe("receiveAgainstPurchaseOrder — quality gate (P0 fix)", () => {
  it("rejects a submission with no lines", async () => {
    const { service } = createMockService();
    const result = await receiveAgainstPurchaseOrder(service, {
      tenantId: "t1",
      poId: "po-1",
      locationId: "loc-1",
      receivedBy: "user-1",
      lines: [],
    });
    expect(result).toEqual({ receipt: null, error: "Add at least one item received." });
  });

  it("rejects a line that fails quality with zero rejected quantity, before any database call", async () => {
    const { service } = createMockService(); // every table would return null/not-found if queried
    const result = await receiveAgainstPurchaseOrder(service, {
      tenantId: "t1",
      poId: "po-1",
      locationId: "loc-1",
      receivedBy: "user-1",
      lines: [baseLine({ qualityPassed: false, qtyRejected: 0 })],
    });
    expect(result.receipt).toBeNull();
    expect(result.error).toMatch(/failed the quality check but show zero rejected quantity/);
  });

  it("lets a failed-quality line through once a rejected quantity is given (partial accept)", async () => {
    // No purchase_orders row configured, so it fails on the *next* check — proving the quality
    // gate itself did not block this submission.
    const { service } = createMockService({ purchase_orders: [{ data: null, error: null }] });
    const result = await receiveAgainstPurchaseOrder(service, {
      tenantId: "t1",
      poId: "po-1",
      locationId: "loc-1",
      receivedBy: "user-1",
      lines: [baseLine({ qualityPassed: false, qtyRejected: 3 })],
    });
    expect(result).toEqual({ receipt: null, error: "Purchase order not found." });
  });

  it("lets a fully-passed line through with zero rejected quantity", async () => {
    const { service } = createMockService({ purchase_orders: [{ data: null, error: null }] });
    const result = await receiveAgainstPurchaseOrder(service, {
      tenantId: "t1",
      poId: "po-1",
      locationId: "loc-1",
      receivedBy: "user-1",
      lines: [baseLine({ qualityPassed: true, qtyRejected: 0 })],
    });
    expect(result).toEqual({ receipt: null, error: "Purchase order not found." });
  });
});

describe("receiveAgainstPurchaseOrder — auto-posting to the ledger", () => {
  it("fails the whole call before any stock moves when a required account is missing", async () => {
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce(null); // Inventory (1400) missing
    vi.mocked(getApAccountId).mockResolvedValueOnce("acct-ap");
    const { service, calls } = createMockService({ purchase_orders: [{ data: poRow(), error: null }] });

    const result = await receiveAgainstPurchaseOrder(service, {
      tenantId: "t1",
      poId: "po-1",
      locationId: "loc-1",
      receivedBy: "user-1",
      lines: [baseLine()],
    });

    expect(result).toEqual({ receipt: null, error: "Missing required accounts: Inventory (1400)." });
    expect(createVendorBill).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === "inventory_receipts")).toBe(false);
    expect(calls.some((c) => c.table === "inventory_stock_movements")).toBe(false);
  });

  it("skips auto-posting for a foreign-currency PO but still receives the stock", async () => {
    const { service, calls } = createMockService({
      purchase_orders: [{ data: poRow({ fx_rate: 1.5 }), error: null }],
      vendors: [{ data: { name: "Acme Supplies" }, error: null }],
      inventory_receipts: [{ data: { id: "receipt-1", receipt_number: "GRN-FX0001" }, error: null }],
      inventory_items: [{ data: { name: "Item A", item_type: null, unit_cost: 5 }, error: null }],
      inventory_stock_levels: [{ data: null, error: null }],
      inventory_stock_movements: [{ data: { id: "movement-1", unit_cost_at_movement: 5, qty: 10 }, error: null }],
      purchase_order_lines: [
        { data: { quantity_received: 0 }, error: null },
        { data: [{ quantity: 10, quantity_received: 10 }], error: null },
      ],
    });

    const result = await receiveAgainstPurchaseOrder(service, {
      tenantId: "t1",
      poId: "po-1",
      locationId: "loc-1",
      receivedBy: "user-1",
      lines: [baseLine()],
    });

    expect(result.error).toBeNull();
    expect(result.billNote).toBe("This purchase order is in a foreign currency — create the vendor bill manually in Accounts.");
    expect(getAccountIdByCode).not.toHaveBeenCalled();
    expect(getApAccountId).not.toHaveBeenCalled();
    expect(createVendorBill).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === "inventory_stock_movements" && c.op === "insert")).toBe(true);
  });

  it("auto-creates and posts a vendor bill when the PO is in the base currency, and stamps the receipt", async () => {
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    vi.mocked(getApAccountId).mockResolvedValueOnce("acct-ap");
    vi.mocked(createVendorBill).mockResolvedValueOnce({
      ok: true,
      id: "bill-1",
      status: "approved",
      requiredApproverRole: "auto",
    });

    const { service, calls } = createMockService({
      purchase_orders: [{ data: poRow(), error: null }],
      vendors: [{ data: { name: "Acme Supplies" }, error: null }],
      inventory_receipts: [{ data: { id: "receipt-1", receipt_number: "GRN-TEST01" }, error: null }],
      inventory_items: [{ data: { name: "Item A", item_type: null, unit_cost: 5 }, error: null }],
      inventory_stock_levels: [{ data: null, error: null }],
      inventory_stock_movements: [{ data: { id: "movement-1", unit_cost_at_movement: 5, qty: 10 }, error: null }],
      purchase_order_lines: [
        { data: { quantity_received: 0 }, error: null },
        { data: [{ quantity: 10, quantity_received: 10 }], error: null },
      ],
      vendor_bills: [{ data: { journal_entry_id: "je-1" }, error: null }],
    });

    const result = await receiveAgainstPurchaseOrder(service, {
      tenantId: "t1",
      poId: "po-1",
      locationId: "loc-1",
      receivedBy: "user-1",
      lines: [baseLine({ qtyReceived: 10, unitCost: 5, qtyRejected: 0 })],
    });

    expect(result.error).toBeNull();
    expect(result.billNote).toBe("Vendor bill GRN-TEST01 auto-created and posted to the ledger.");
    expect(createVendorBill).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        purchaseOrderId: "po-1",
        expenseAccountId: "acct-inventory",
        apAccountId: "acct-ap",
        subtotal: 50,
        fxRate: 1,
        department: "Kitchen",
      }),
    );
    const receiptStamp = calls.find(
      (c) => c.table === "inventory_receipts" && c.op === "update" && (c.payload as { journal_entry_id?: string }).journal_entry_id,
    );
    expect(receiptStamp?.payload).toMatchObject({ journal_entry_id: "je-1" });
  });

  it("still returns the receipt when the auto-bill fails, since stock has already moved", async () => {
    vi.mocked(getAccountIdByCode).mockResolvedValueOnce("acct-inventory");
    vi.mocked(getApAccountId).mockResolvedValueOnce("acct-ap");
    vi.mocked(createVendorBill).mockResolvedValueOnce({ ok: false, error: "Vendor not found." });

    const { service } = createMockService({
      purchase_orders: [{ data: poRow(), error: null }],
      vendors: [{ data: { name: "Acme Supplies" }, error: null }],
      inventory_receipts: [{ data: { id: "receipt-1", receipt_number: "GRN-TEST02" }, error: null }],
      inventory_items: [{ data: { name: "Item A", item_type: null, unit_cost: 5 }, error: null }],
      inventory_stock_levels: [{ data: null, error: null }],
      inventory_stock_movements: [{ data: { id: "movement-1", unit_cost_at_movement: 5, qty: 10 }, error: null }],
      purchase_order_lines: [
        { data: { quantity_received: 0 }, error: null },
        { data: [{ quantity: 10, quantity_received: 10 }], error: null },
      ],
    });

    const result = await receiveAgainstPurchaseOrder(service, {
      tenantId: "t1",
      poId: "po-1",
      locationId: "loc-1",
      receivedBy: "user-1",
      lines: [baseLine()],
    });

    expect(result.error).toBeNull();
    expect(result.receipt).not.toBeNull();
    expect(result.billNote).toBe("Goods received, but the vendor bill could not be auto-created: Vendor not found.");
  });
});
