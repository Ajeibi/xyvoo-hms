"use client";

import type { FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GuestDetailBlock } from "./guest-details";
import { PAYMENT_DOT_CLASS, PAYMENT_STATUS_HINT, PAYMENT_STATUS_LABEL } from "./payment-styles";
import { ROOM_STATUS_CELL_CLASS } from "./status-styles";
import { Moon, MoreVertical, ShieldAlert, Star } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RoomOpsAction } from "../rooms/ops/types";

function RoomTooltipContent({ room }: { room: FrontDeskRoomBoardItem }) {
  const stay = room.stay ?? room.reservedStay;

  if (room.displayStatus === "available") {
    return (
      <div className="space-y-1.5 text-left text-sm">
        <p className="font-semibold">Room {room.roomCode}</p>
        <p>Type: {room.roomTypeName}</p>
        <p>Grid: {room.roomTypeGridAbbrev}</p>
        <p>Status: {room.statusLabel}</p>
      </div>
    );
  }

  if (
    room.displayStatus === "dirty" ||
    room.displayStatus === "maintenance" ||
    room.displayStatus === "outOfService"
  ) {
    return (
      <div className="space-y-1.5 text-left text-sm">
        <p className="font-semibold">Room {room.roomCode}</p>
        <p className="text-slate-300">
          {room.roomTypeName} · <span className="font-semibold text-white">{room.roomTypeGridAbbrev}</span>
        </p>
        <p>Status: {room.statusLabel}</p>
        {room.notes ? <p>Details: {room.notes}</p> : null}
        {room.housekeeping ? (
          <p className="text-slate-300">HK: {room.housekeeping.status.replace(/_/g, " ")}</p>
        ) : null}
      </div>
    );
  }

  if (stay) {
    return (
      <div className="space-y-2 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          Room {room.roomCode} · {room.statusLabel} · {room.roomTypeGridAbbrev}
        </p>
        {stay.guest ? (
          <GuestDetailBlock guest={stay.guest} />
        ) : (
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{stay.guestName}</p>
            <p>Ref {stay.confirmationCode}</p>
          </div>
        )}
        {room.paymentStatus ? (
          <p className="border-t border-slate-600/40 pt-2 text-xs text-slate-200">
            <span className="font-semibold text-white">Payment: </span>
            {PAYMENT_STATUS_LABEL[room.paymentStatus]}
          </p>
        ) : null}
        {room.housekeeping || room.unitStatus === "dirty" || room.unitStatus === "cleaning_in_progress" ? (
          <p className="text-xs text-slate-300">
            HK: {room.housekeeping?.status.replace(/_/g, " ") ?? room.unitStatus.replace(/_/g, " ")}
          </p>
        ) : null}
      </div>
    );
  }

  if (room.housekeeping || room.unitStatus === "dirty" || room.unitStatus === "cleaning_in_progress") {
    return (
      <div className="space-y-1.5 text-left text-sm">
        <p className="font-semibold">Room {room.roomCode}</p>
        <p className="text-slate-300">
          {room.roomTypeName} · {room.roomTypeGridAbbrev}
        </p>
        <p>Status: {room.statusLabel}</p>
        <p className="text-slate-300">
          HK: {room.housekeeping?.status.replace(/_/g, " ") ?? "—"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-left text-sm">
      <p className="font-semibold">Room {room.roomCode}</p>
      <p className="text-slate-300">
        {room.roomTypeName} · {room.roomTypeGridAbbrev}
      </p>
      <p>{room.statusLabel}</p>
    </div>
  );
}

const CELL_OPS: { key: RoomOpsAction; label: string }[] = [
  { key: "change-assignment", label: "Change assignment" },
  { key: "block", label: "Block room" },
  { key: "move", label: "Move guest" },
  { key: "priority-clean", label: "Priority clean" },
  { key: "unlock", label: "Remote unlock" },
  { key: "key-reissue", label: "Key reissue" },
  { key: "connecting", label: "Connecting rooms" },
];

export function FrontDeskRoomCell({
  room,
  selected = false,
  onSelect,
  onRoomAction,
}: {
  room: FrontDeskRoomBoardItem;
  selected?: boolean;
  onSelect: (room: FrontDeskRoomBoardItem) => void;
  onRoomAction?: (action: RoomOpsAction, room: FrontDeskRoomBoardItem) => void;
}) {
  const stay = room.stay ?? room.reservedStay;
  const emergency =
    room.roomFlags.securityHold || room.roomFlags.dnd || room.roomFlags.staffRestricted;

  return (
    <div className="relative min-w-[7.25rem]">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSelect(room)}
            className={cn(
              "relative h-auto min-h-[5.25rem] w-full min-w-[7.25rem] flex-col justify-center gap-1 rounded-xl px-2.5 py-2.5 text-center text-xs font-semibold shadow-sm transition-all hover:translate-y-0 active:translate-y-0",
              ROOM_STATUS_CELL_CLASS[room.displayStatus],
              emergency && !selected && "ring-2 ring-violet-400 ring-offset-1",
              selected &&
                "z-20 scale-[1.08] shadow-2xl shadow-blue-600/50 ring-[5px] ring-blue-500 ring-offset-[3px] ring-offset-white outline outline-2 outline-dashed outline-white",
            )}
            aria-pressed={selected}
            aria-label={
              selected
                ? `Selected — Room ${room.roomCode}, ${room.statusLabel}`
                : room.paymentStatus
                  ? `Room ${room.roomCode}, ${room.statusLabel}, ${PAYMENT_STATUS_LABEL[room.paymentStatus]}`
                  : `Room ${room.roomCode}, ${room.statusLabel}`
            }
          >
            {selected ? (
              <span className="absolute -top-2.5 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-blue-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shadow-md ring-2 ring-white">
                Selected
              </span>
            ) : null}
            {room.paymentStatus ? (
              <span
                className={cn(
                  "absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full",
                  PAYMENT_DOT_CLASS[room.paymentStatus],
                )}
                title={`${PAYMENT_STATUS_LABEL[room.paymentStatus]} — ${PAYMENT_STATUS_HINT[room.paymentStatus]}`}
              />
            ) : null}
            {stay?.isVip ? (
              <Star
                className="absolute left-1.5 top-1.5 h-3 w-3 fill-amber-300 text-amber-200"
                aria-label="VIP"
              />
            ) : null}
            {room.roomFlags.dnd ? (
              <Moon className="absolute bottom-1 left-1.5 h-3 w-3 text-white/90" aria-label="Do not disturb" />
            ) : null}
            {room.roomFlags.securityHold ? (
              <ShieldAlert
                className={`absolute bottom-1 h-3 w-3 text-white/90 ${room.roomFlags.dnd ? "left-5" : "left-1.5"}`}
                aria-label="Security hold"
              />
            ) : null}
            <span className="text-base font-bold tabular-nums leading-none">{room.roomCode}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide opacity-90">
              {room.roomTypeGridAbbrev}
            </span>
            <span className="line-clamp-2 text-[11px] leading-snug font-medium whitespace-normal opacity-95">
              {room.statusShortLabel}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] px-3 py-2.5">
          <RoomTooltipContent room={room} />
        </TooltipContent>
      </Tooltip>
      {onRoomAction ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="absolute right-1 bottom-1 z-30 rounded p-0.5 text-white/90 hover:bg-black/20"
              aria-label={`Room ${room.roomCode} actions`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {CELL_OPS.map((op) => (
              <DropdownMenuItem
                key={op.key}
                onClick={() => {
                  onSelect(room);
                  onRoomAction(op.key, room);
                }}
              >
                {op.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
