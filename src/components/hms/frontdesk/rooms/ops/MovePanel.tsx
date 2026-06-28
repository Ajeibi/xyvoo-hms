"use client";

import { Input } from "@/components/ui/input";
import type { RoomOption } from "./types";

export function MovePanel({
  targetRoomSearch,
  onTargetRoomSearchChange,
  targetRoomId,
  onTargetRoomIdChange,
  filteredRooms,
}: {
  targetRoomSearch: string;
  onTargetRoomSearchChange: (v: string) => void;
  targetRoomId: string;
  onTargetRoomIdChange: (v: string) => void;
  filteredRooms: RoomOption[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-600">Destination room</p>
      <Input
        placeholder="Search room number…"
        value={targetRoomSearch}
        onChange={(e) => onTargetRoomSearchChange(e.target.value)}
      />
      <select
        className="h-10 w-full rounded-lg border border-input px-3 text-sm"
        value={targetRoomId}
        onChange={(e) => onTargetRoomIdChange(e.target.value)}
      >
        <option value="">Select room…</option>
        {filteredRooms.slice(0, 40).map((r) => (
          <option key={r.id} value={r.id}>
            {r.roomCode} ({r.displayStatus})
          </option>
        ))}
      </select>
    </div>
  );
}
