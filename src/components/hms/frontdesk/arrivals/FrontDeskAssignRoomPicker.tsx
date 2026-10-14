"use client";

import { useId, useMemo } from "react";
import { HmsField, hmsInput } from "@/components/hms/hms-ui";
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
  const uid = useId();
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
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Booked room type: <span className="font-medium text-slate-900">{roomTypeCode}</span>
      </p>
      {floors.length > 1 ? (
        <HmsField id={`${uid}-floor`} label="Floor">
          <select
            id={`${uid}-floor`}
            className={`${hmsInput} cursor-pointer`}
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
        </HmsField>
      ) : null}
      <HmsField id={`${uid}-room`} label="Room" hint="Each room shows its floor, type and whether it's ready.">
        <select
          id={`${uid}-room`}
          aria-describedby={`${uid}-room-hint`}
          className={`${hmsInput} cursor-pointer`}
          value={roomUnitId}
          onChange={(e) => onRoomUnitIdChange(e.target.value)}
        >
          <option value="">Choose a room…</option>
          {filtered.map((u) => (
            <option key={u.id} value={u.id}>
              {u.roomCode} · Floor {u.floor} · {u.roomTypeCode} ·{" "}
              {READINESS_LABEL[u.readiness] ?? u.readiness}
            </option>
          ))}
        </select>
      </HmsField>
      {selected && selected.roomTypeCode !== roomTypeCode ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          This is an upgrade: {roomTypeCode} → {selected.roomTypeCode}
        </p>
      ) : null}
      {needsPin ? (
        <div>
          <label htmlFor={`${uid}-pin`} className="mb-1 block text-sm font-medium text-slate-800">
            Manager PIN
          </label>
          <input
            id={`${uid}-pin`}
            type="password"
            aria-describedby={`${uid}-pin-hint`}
            disabled={!canOverrideRoom}
            className={`${hmsInput} disabled:bg-slate-50`}
            value={managerPin}
            onChange={(e) => onManagerPinChange(e.target.value)}
          />
          <p id={`${uid}-pin-hint`} className="mt-1 text-xs text-slate-600">
            This room isn&apos;t ready yet, so a manager needs to approve it.
            {!canOverrideRoom ? " Ask a manager to do this for you." : ""}
          </p>
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
