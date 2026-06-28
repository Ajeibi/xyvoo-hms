"use client";

import { MousePointerClick, X } from "lucide-react";
import type { FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import { Button } from "@/components/ui/button";
import { ROOM_STATUS_CELL_CLASS } from "../board/status-styles";
import { cn } from "@/lib/utils";

export function FrontDeskSelectedRoomCallout({
  room,
  onClear,
  onViewDetails,
}: {
  room: FrontDeskRoomBoardItem;
  onClear: () => void;
  onViewDetails?: () => void;
}) {
  const stay = room.stay ?? room.reservedStay;
  const guestLabel = stay?.guestName ?? "No guest assigned";

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-in fade-in slide-in-from-top-2 relative overflow-hidden rounded-xl border-[3px] border-blue-600 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 p-[3px] shadow-lg shadow-blue-500/30 duration-300"
    >
      <div className="flex flex-wrap items-center gap-4 rounded-[10px] bg-white px-4 py-3 sm:px-5">
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl font-black tabular-nums text-white shadow-inner",
            ROOM_STATUS_CELL_CLASS[room.displayStatus],
          )}
        >
          {room.roomCode}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            <MousePointerClick className="h-3.5 w-3.5" aria-hidden />
            Room selected
          </p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">
            Room {room.roomCode}
            <span className="ml-2 text-base font-semibold text-slate-500">· {room.statusLabel}</span>
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-600">{guestLabel}</p>
          {room.roomTypeName ? (
            <p className="text-xs text-slate-500">
              {room.roomTypeName}
              {room.roomTypeGridAbbrev ? (
                <span className="ml-1 font-semibold text-slate-700">({room.roomTypeGridAbbrev})</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {onViewDetails ? (
            <Button type="button" size="sm" onClick={onViewDetails}>
              View details
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={onClear}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
