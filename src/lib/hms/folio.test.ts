import { describe, expect, it } from "vitest";
import { reassignFolioLinesSplitLeg } from "./folio";

type CannedResponse = { data: unknown; error: unknown };
type CallRecord = { table: string; op: string; payload?: unknown };

function createMockService(responses: Record<string, CannedResponse[]> = {}) {
  const calls: CallRecord[] = [];

  function makeChain(table: string) {
    const queue = responses[table];
    const response: CannedResponse = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
    const chain: Record<string, unknown> = {
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      select: () => Promise.resolve(response),
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload });
        return chain;
      },
    };
    return chain;
  }

  const service = {
    schema: () => ({ from: (table: string) => makeChain(table) }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { service, calls };
}

describe("reassignFolioLinesSplitLeg (P2 fix — split-folio bulk reassign)", () => {
  it("requires at least one line id", async () => {
    const { service } = createMockService();
    const result = await reassignFolioLinesSplitLeg(service, {
      tenantId: "t1",
      reservationId: "r1",
      lineIds: [],
      splitLeg: "company",
    });
    expect(result).toEqual({ ok: false, error: "Select at least one line to move." });
  });

  it("updates the matched lines and reports how many moved", async () => {
    const { service, calls } = createMockService({
      folio_transactions: [{ data: [{ id: "line-1" }, { id: "line-2" }], error: null }],
    });
    const result = await reassignFolioLinesSplitLeg(service, {
      tenantId: "t1",
      reservationId: "r1",
      lineIds: ["line-1", "line-2"],
      splitLeg: "company",
    });
    expect(result).toEqual({ ok: true, count: 2 });
    const update = calls.find((c) => c.table === "folio_transactions" && c.op === "update");
    expect(update?.payload).toEqual({ split_leg: "company" });
  });

  it("surfaces a database error", async () => {
    const { service } = createMockService({
      folio_transactions: [{ data: null, error: { message: "db exploded" } }],
    });
    const result = await reassignFolioLinesSplitLeg(service, {
      tenantId: "t1",
      reservationId: "r1",
      lineIds: ["line-1"],
      splitLeg: "guest",
    });
    expect(result).toEqual({ ok: false, error: "db exploded" });
  });
});
