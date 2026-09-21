import { describe, expect, it } from "vitest";
import { getReadNotificationIds, markNotificationRead, markNotificationsRead } from "./notification-reads";

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
      upsert: (payload: unknown) => {
        calls.push({ table, op: "upsert", payload });
        return Promise.resolve(response);
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve),
    };
    return chain;
  }

  const service = {
    schema: () => ({ from: (table: string) => makeChain(table) }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { service, calls };
}

describe("getReadNotificationIds (P2 fix — per-user notification reads)", () => {
  it("returns an empty set for an empty id list without querying", async () => {
    const { service, calls } = createMockService();
    const result = await getReadNotificationIds(service, "t1", "user-1", []);
    expect(result).toEqual(new Set());
    expect(calls).toHaveLength(0);
  });

  it("returns only the ids this user has read", async () => {
    const { service } = createMockService({
      notification_reads: [{ data: [{ notification_id: "n1" }, { notification_id: "n3" }], error: null }],
    });
    const result = await getReadNotificationIds(service, "t1", "user-1", ["n1", "n2", "n3"]);
    expect(result).toEqual(new Set(["n1", "n3"]));
  });
});

describe("markNotificationRead", () => {
  it("upserts a single per-user read row", async () => {
    const { service, calls } = createMockService();
    const result = await markNotificationRead(service, "t1", "user-1", "n1");
    expect(result.ok).toBe(true);
    const upsert = calls.find((c) => c.table === "notification_reads" && c.op === "upsert");
    expect(upsert?.payload).toMatchObject({ tenant_id: "t1", notification_id: "n1", user_id: "user-1" });
  });
});

describe("markNotificationsRead", () => {
  it("is a no-op for an empty id list", async () => {
    const { service, calls } = createMockService();
    const result = await markNotificationsRead(service, "t1", "user-1", []);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("upserts one row per notification for this user only", async () => {
    const { service, calls } = createMockService();
    const result = await markNotificationsRead(service, "t1", "user-1", ["n1", "n2"]);
    expect(result.ok).toBe(true);
    const upsert = calls.find((c) => c.table === "notification_reads" && c.op === "upsert");
    const rows = upsert?.payload as { notification_id: string; user_id: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.user_id === "user-1")).toBe(true);
  });
});
