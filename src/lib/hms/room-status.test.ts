import { afterEach, describe, expect, it, vi } from "vitest";
import { setRoomStatus, writeRoomStatus } from "./room-status";

vi.mock("@/lib/hms/front-desk-ops", () => ({
  writeAuditLog: vi.fn(),
}));

import { writeAuditLog } from "@/lib/hms/front-desk-ops";

afterEach(() => {
  vi.mocked(writeAuditLog).mockClear();
});

function makeService(updateError: { message: string } | null = null) {
  const eqMock = vi.fn();
  const chain = {
    eq: eqMock,
  };
  eqMock.mockImplementation(() => {
    // First .eq() call returns the chain again (for the second .eq()); the
    // second resolves the whole thenable-style call with { error }.
    return eqMock.mock.calls.length >= 2
      ? Promise.resolve({ error: updateError })
      : chain;
  });

  const updateMock = vi.fn().mockReturnValue(chain);
  const fromMock = vi.fn().mockReturnValue({ update: updateMock });
  const schemaMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    service: { schema: schemaMock } as unknown as import("@supabase/supabase-js").SupabaseClient,
    schemaMock,
    fromMock,
    updateMock,
    eqMock,
  };
}

describe("writeRoomStatus", () => {
  it("updates the room_units row for the given tenant and room", async () => {
    const { service, schemaMock, fromMock, updateMock, eqMock } = makeService();

    const result = await writeRoomStatus(service, {
      tenantId: "tenant-1",
      roomUnitId: "room-1",
      status: "dirty",
      extra: { notes: "guest left early" },
    });

    expect(result).toEqual({ ok: true });
    expect(schemaMock).toHaveBeenCalledWith("hotel");
    expect(fromMock).toHaveBeenCalledWith("room_units");
    expect(updateMock).toHaveBeenCalledWith({ status: "dirty", notes: "guest left early" });
    expect(eqMock).toHaveBeenNthCalledWith(1, "tenant_id", "tenant-1");
    expect(eqMock).toHaveBeenNthCalledWith(2, "id", "room-1");
  });

  it("surfaces the database error instead of throwing", async () => {
    const { service } = makeService({ message: "boom" });

    const result = await writeRoomStatus(service, {
      tenantId: "tenant-1",
      roomUnitId: "room-1",
      status: "maintenance",
    });

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

describe("setRoomStatus", () => {
  it("writes the status and logs a room_status_changed audit entry", async () => {
    const { service } = makeService();

    const result = await setRoomStatus(service, {
      tenantId: "tenant-1",
      roomUnitId: "room-1",
      status: "dirty",
      actorUserId: "user-1",
      roomCode: "101",
      previousStatus: "inspected",
    });

    expect(result).toEqual({ ok: true });
    expect(writeAuditLog).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      action: "room_status_changed",
      entityType: "room_unit",
      entityId: "room-1",
      before: { status: "inspected", room_code: "101" },
      after: { status: "dirty", room_code: "101" },
    });
  });

  it("skips the audit log entirely when the write fails", async () => {
    const { service } = makeService({ message: "boom" });

    const result = await setRoomStatus(service, {
      tenantId: "tenant-1",
      roomUnitId: "room-1",
      status: "dirty",
      actorUserId: "user-1",
    });

    expect(result).toEqual({ ok: false, error: "boom" });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("omits `before` when previousStatus was never passed", async () => {
    const { service } = makeService();

    await setRoomStatus(service, {
      tenantId: "tenant-1",
      roomUnitId: "room-1",
      status: "occupied",
      actorUserId: null,
    });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ before: undefined, after: { status: "occupied", room_code: null } }),
    );
  });
});
