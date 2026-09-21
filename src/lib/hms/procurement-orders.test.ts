import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/front-desk-ops", () => ({
  writeAuditLog: vi.fn(),
}));
vi.mock("@/lib/hms/notification-rules", () => ({
  notifyPoApprovalNeeded: vi.fn(),
  notifyPoApproved: vi.fn(),
  notifyPoRejected: vi.fn(),
}));
vi.mock("@/lib/hms/procurement-budgets", () => ({
  checkAndNotifyBudgetThreshold: vi.fn(),
}));

import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { notifyPoApproved } from "@/lib/hms/notification-rules";
import { checkAndNotifyBudgetThreshold } from "@/lib/hms/procurement-budgets";
import { approvePurchaseOrder } from "./procurement-orders";

afterEach(() => {
  vi.mocked(writeAuditLog).mockClear();
  vi.mocked(notifyPoApproved).mockClear();
  vi.mocked(checkAndNotifyBudgetThreshold).mockClear();
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

describe("approvePurchaseOrder — role gate (P0 fix)", () => {
  it("refuses a staff member outright, before touching the database", async () => {
    const { service, calls } = createMockService();
    const result = await approvePurchaseOrder(service, "t1", "po-1", "user-1", { membershipRole: "staff" });
    expect(result).toEqual({ error: "Only an owner or admin can approve a purchase order." });
    expect(calls.length).toBe(0);
  });

  it("refuses a caller with no recognized role", async () => {
    const { service } = createMockService();
    const result = await approvePurchaseOrder(service, "t1", "po-1", "user-1", { membershipRole: "front_desk" });
    expect(result).toEqual({ error: "Only an owner or admin can approve a purchase order." });
  });

  it("refuses to approve a PO that isn't pending approval, even for an admin", async () => {
    const { service } = createMockService({
      purchase_orders: [{ data: { status: "approved" }, error: null }],
    });
    const result = await approvePurchaseOrder(service, "t1", "po-1", "user-1", { membershipRole: "admin" });
    expect(result).toEqual({ error: "Only a purchase order awaiting approval can be approved (currently approved)." });
  });

  it("refuses when the PO doesn't exist", async () => {
    const { service } = createMockService({
      purchase_orders: [{ data: null, error: null }],
    });
    const result = await approvePurchaseOrder(service, "t1", "po-1", "user-1", { membershipRole: "owner" });
    expect(result).toEqual({ error: "Purchase order not found." });
  });

  it("approves for an owner and posts the audit trail + budget check + notification", async () => {
    const { service, calls } = createMockService({
      purchase_orders: [
        { data: { status: "pending_approval" }, error: null },
        { data: { po_number: "PO-1", total: 750, currency: "NGN", department: "Kitchen" }, error: null },
      ],
    });

    const result = await approvePurchaseOrder(service, "t1", "po-1", "user-1", { membershipRole: "owner" });

    expect(result).toEqual({ error: null });
    const update = calls.find((c) => c.table === "purchase_orders" && c.op === "update");
    expect(update?.payload).toMatchObject({ status: "approved", approved_by: "user-1" });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "po_approved", entityId: "po-1" }));
    expect(checkAndNotifyBudgetThreshold).toHaveBeenCalledWith(service, "t1", "Kitchen");
    expect(notifyPoApproved).toHaveBeenCalledWith(expect.objectContaining({ poNumber: "PO-1", total: 750 }));
  });

  it("approves for an admin the same way as an owner", async () => {
    const { service } = createMockService({
      purchase_orders: [
        { data: { status: "pending_approval" }, error: null },
        { data: { po_number: "PO-2", total: 100, currency: "NGN", department: "Bar" }, error: null },
      ],
    });
    const result = await approvePurchaseOrder(service, "t1", "po-2", "user-2", { membershipRole: "admin" });
    expect(result).toEqual({ error: null });
  });
});
