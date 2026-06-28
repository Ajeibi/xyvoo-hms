"use client";

import type { FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import type { RoomOpsAction } from "../rooms/ops/types";
import { FrontDeskRoomCell } from "./FrontDeskRoomCell";

export function FrontDeskRoomGrid({
  rooms,
  selectedRoomId,
  onSelectRoom,
  onRoomAction,
}: {
  rooms: FrontDeskRoomBoardItem[];
  selectedRoomId?: string | null;
  onSelectRoom: (room: FrontDeskRoomBoardItem) => void;
  onRoomAction?: (action: RoomOpsAction, room: FrontDeskRoomBoardItem) => void;
}) {
  if (rooms.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
        No rooms on this floor.
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] gap-2.5"
      role="list"
      aria-label="Room grid"
    >
      {rooms.map((room) => (
        <FrontDeskRoomCell
          key={room.id}
          room={room}
          selected={selectedRoomId === room.id}
          onSelect={onSelectRoom}
          onRoomAction={onRoomAction}
        />
      ))}
    </div>
  );
}
