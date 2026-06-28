"use client";

import { useMemo } from "react";
import type { AssignableRoomOption } from "@/lib/hms/arrivals-workbench";
import { toastError, toastSuccess } from "@/lib/app-toast";

export const READINESS_LABEL: Record<string, string> = {
  ready: "Ready",
  dirty: "Dirty",
  cleaning: "Cleaning",
  inspected: "Inspected",
  maintenance: "Blocked",
};

export function FrontDeskAssignRoomPicker({
  slug,
  reservationId,
  roomTypeCode,
  assignableRooms,
  roomUnitId,
  onRoomUnitIdChange,
  managerPin,
  onManagerPinChange,
  canOverrideRoom,
  floorFilter,
  onFloorFilterChange,
}: {
  slug: string;
  reservationId: string;
  roomTypeCode: string;
  assignableRooms: AssignableRoomOption[];
  roomUnitId: string;
  onRoomUnitIdChange: (id: string) => void;
  managerPin: string;
  onManagerPinChange: (pin: string) => void;
  canOverrideRoom: boolean;
  floorFilter: string;
  onFloorFilterChange: (floor: string) => void;
}) {
  const floors = useMemo(() => {
    const set = new Set(assignableRooms.map((u) => u.floor));
    return [...set].sort((a, b) => a - b);
  }, [assignableRooms]);

  const filtered = useMemo(() => {
    if (!floorFilter) return assignableRooms;
    return assignableRooms.filter((u) => String(u.floor) === floorFilter);
  }, [assignableRooms, floorFilter]);

  const selected = assignableRooms.find((u) => u.id === roomUnitId);
  const needsPin = selected && selected.readiness !== "ready" && selected.readiness !== "inspected";

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Reserved type: <span className="font-medium text-slate-700">{roomTypeCode}</span>
      </p>
      {floors.length > 1 ? (
        <select
          className="w-full cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={floorFilter}
          onChange={(e) => onFloorFilterChange(e.target.value)}
        >
          <option value="">All floors</option>
          {floors.map((f) => (
            <option key={f} value={String(f)}>
              Floor {f}
            </option>
          ))}
        </select>
      ) : null}
      <select
        className="w-full cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={roomUnitId}
        onChange={(e) => onRoomUnitIdChange(e.target.value)}
      >
        <option value="">Select room…</option>
        {filtered.map((u) => (
          <option key={u.id} value={u.id}>
            {u.roomCode} · Fl.{u.floor} · {u.roomTypeCode} ·{" "}
            {READINESS_LABEL[u.readiness] ?? u.readiness}
          </option>
        ))}
      </select>
      {selected && selected.roomTypeCode !== roomTypeCode ? (
        <p className="text-xs font-medium text-amber-800">
          Room upgrade: {roomTypeCode} → {selected.roomTypeCode}
        </p>
      ) : null}
      {needsPin ? (
        <div>
          <label className="block text-xs text-slate-500">
            Manager PIN (room not ready)
            {!canOverrideRoom ? " — manager role required" : ""}
          </label>
          <input
            type="password"
            disabled={!canOverrideRoom}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            value={managerPin}
            onChange={(e) => onManagerPinChange(e.target.value)}
          />
        </div>
      ) : null}
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reservationId" value={reservationId} />
    </div>
  );
}

export async function assignRoomApi(params: {
  slug: string;
  reservationId: string;
  roomUnitId: string | null;
  managerPin?: string;
}): Promise<{ ok: boolean; error?: string; requiresPin?: boolean; roomCode?: string }> {
  const res = await fetch(`/api/hotel/frontdesk/arrivals/${params.reservationId}/assign-room`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: params.slug,
      roomUnitId: params.roomUnitId,
      managerPin: params.managerPin || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    toastError("Could not assign room", data.error ?? "Try again.");
    return { ok: false, error: data.error, requiresPin: data.requiresPin };
  }
  toastSuccess(data.roomCode ? `Room ${data.roomCode} assigned` : "Room assigned");
  return { ok: true, roomCode: data.roomCode };
}
