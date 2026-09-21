import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hms/notification-rules", () => ({
  notifyWaitlistMatch: vi.fn(),
}));

import { notifyWaitlistMatch } from "@/lib/hms/notification-rules";
import { matchWaitlistForOpening } from "./waitlist";

afterEach(() => {
  vi.mocked(notifyWaitlistMatch).mockClear();
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
      order: () => chain,
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload });
        return chain;
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

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "wl-1",
    guest_name: "Ada Obi",
    desired_room_type_code: "DLX",
    desired_arrival_date: "2026-08-10",
    desired_departure_date: "2026-08-12",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const OPENING = { roomTypeCode: "DLX", arrivalAt: "2026-08-10T14:00:00Z", departureAt: "2026-08-12T11:00:00Z" };

describe("matchWaitlistForOpening (P2 fix)", () => {
  it("returns false when nobody is waiting", async () => {
    const { service } = createMockService({ waitlist_entries: [{ data: [], error: null }] });
    const result = await matchWaitlistForOpening(service, "t1", OPENING);
    expect(result).toBe(false);
    expect(notifyWaitlistMatch).not.toHaveBeenCalled();
  });

  it("matches a waiting entry with the same room type and overlapping dates, marks it notified, and alerts staff", async () => {
    const { service, calls } = createMockService({ waitlist_entries: [{ data: [entry()], error: null }] });
    const result = await matchWaitlistForOpening(service, "t1", OPENING);

    expect(result).toBe(true);
    const update = calls.find((c) => c.table === "waitlist_entries" && c.op === "update");
    expect(update?.payload).toMatchObject({ status: "notified" });
    expect(notifyWaitlistMatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", entityId: "wl-1", guestName: "Ada Obi" }),
    );
  });

  it("does not match when the desired dates don't overlap the opening", async () => {
    const { service } = createMockService({
      waitlist_entries: [{ data: [entry({ desired_arrival_date: "2026-09-01", desired_departure_date: "2026-09-03" })], error: null }],
    });
    const result = await matchWaitlistForOpening(service, "t1", OPENING);
    expect(result).toBe(false);
    expect(notifyWaitlistMatch).not.toHaveBeenCalled();
  });

  it("does not match when the room type differs", async () => {
    const { service } = createMockService({
      waitlist_entries: [{ data: [entry({ desired_room_type_code: "STD" })], error: null }],
    });
    const result = await matchWaitlistForOpening(service, "t1", OPENING);
    expect(result).toBe(false);
  });

  it("matches a 'any room type' entry (null desired type) regardless of the opening's room type", async () => {
    const { service } = createMockService({
      waitlist_entries: [{ data: [entry({ desired_room_type_code: null })], error: null }],
    });
    const result = await matchWaitlistForOpening(service, "t1", OPENING);
    expect(result).toBe(true);
  });
});
