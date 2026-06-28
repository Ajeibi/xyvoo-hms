"use client";

import { useMemo } from "react";
import { Star } from "lucide-react";
import type {
  FrontDeskPendingArrivalItem,
  FrontDeskRoomBoardItem,
  FrontDeskSummaryCounts,
} from "@/lib/hms/front-desk-board";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SUMMARY_CARD_CLASS, SUMMARY_CARD_LABELS } from "./status-styles";
import { cn } from "@/lib/utils";

export type RoomStatusSummaryKey = keyof FrontDeskSummaryCounts;

function formatStayTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sortRooms(rooms: FrontDeskRoomBoardItem[]) {
  return [...rooms].sort((a, b) => {
    if (a.floor !== b.floor) return a.floor - b.floor;
    return a.roomCode.localeCompare(b.roomCode, undefined, { numeric: true });
  });
}

function roomSubtitle(status: RoomStatusSummaryKey, room: FrontDeskRoomBoardItem): string {
  const stay = room.stay ?? room.reservedStay;
  switch (status) {
    case "overdueCheckout":
      return stay
        ? `${stay.guestName} · Due out ${formatStayTime(stay.checkOutAt || stay.departureAt)}`
        : room.roomTypeName;
    case "inHouse":
      return stay
        ? `${stay.guestName} · Departs ${formatStayTime(stay.checkOutAt || stay.departureAt)}`
        : room.roomTypeName;
    case "reserved":
      return room.reservedStay
        ? `${room.reservedStay.guestName} · Arrives ${formatStayTime(room.reservedStay.arrivalAt)}`
        : room.roomTypeName;
    case "dirty":
      return room.housekeeping?.status
        ? `${room.roomTypeName} · HK: ${room.housekeeping.status}`
        : room.roomTypeName;
    case "maintenance":
    case "outOfService":
      return room.notes?.trim() || room.roomTypeName;
    default:
      return room.roomTypeName;
  }
}

function RoomRow({
  room,
  status,
  onSelect,
}: {
  room: FrontDeskRoomBoardItem;
  status: RoomStatusSummaryKey;
  onSelect?: (room: FrontDeskRoomBoardItem) => void;
}) {
  const stay = room.stay ?? room.reservedStay;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(room)}
        className={cn(
          "w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-left text-sm transition-colors",
          onSelect && "cursor-pointer hover:border-slate-300 hover:bg-white",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-semibold text-slate-900">
            {stay?.isVip ? (
              <Star className="mr-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label="VIP" />
            ) : null}
            Room {room.roomCode}
          </p>
          <span className="text-xs font-medium text-slate-500">
            Floor {room.floor} · {room.roomTypeCode}
          </span>
        </div>
        <p className="mt-1 text-slate-600">{roomSubtitle(status, room)}</p>
      </button>
    </li>
  );
}

function UnassignedArrivalRow({ arrival }: { arrival: FrontDeskPendingArrivalItem }) {
  return (
    <li className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-slate-900">
          {arrival.isVip ? (
            <Star className="mr-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label="VIP" />
          ) : null}
          {arrival.guestName}
        </p>
        <span className="text-xs font-medium text-amber-800">No room assigned</span>
      </div>
      <p className="mt-1 text-slate-600">
        Arrives {arrival.checkInTime} · {arrival.bookingSourceLabel}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{arrival.confirmationCode}</p>
    </li>
  );
}

const STATUS_DESCRIPTIONS: Record<RoomStatusSummaryKey, string> = {
  overdueCheckout: "Guests still in-house past their scheduled departure.",
  available: "Rooms ready to sell or assign.",
  reserved: "Rooms held for upcoming arrivals, including unassigned reservations.",
  dirty: "Rooms awaiting housekeeping or actively being cleaned.",
  maintenance: "Rooms under repair or inspection hold.",
  outOfService: "Rooms blocked from sale.",
  inHouse: "Guests currently checked in.",
};

export function FrontDeskRoomStatusDetailDialog({
  open,
  onOpenChange,
  statusKey,
  rooms,
  pendingArrivals = [],
  onSelectRoom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statusKey: RoomStatusSummaryKey | null;
  rooms: FrontDeskRoomBoardItem[];
  pendingArrivals?: FrontDeskPendingArrivalItem[];
  onSelectRoom?: (room: FrontDeskRoomBoardItem) => void;
}) {
  const filteredRooms = useMemo(() => {
    if (!statusKey) return [];
    return sortRooms(rooms.filter((r) => r.displayStatus === statusKey));
  }, [rooms, statusKey]);

  const unassignedArrivals = useMemo(() => {
    if (statusKey !== "reserved") return [];
    return pendingArrivals.filter((a) => !a.roomCode);
  }, [pendingArrivals, statusKey]);

  const totalCount = filteredRooms.length + unassignedArrivals.length;

  if (!statusKey) return null;

  const label = SUMMARY_CARD_LABELS[statusKey];
  const accent = SUMMARY_CARD_CLASS[statusKey];

  function handleSelect(room: FrontDeskRoomBoardItem) {
    onSelectRoom?.(room);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85vh,640px)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className={cn("h-1.5 shrink-0", accent)} aria-hidden />
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{STATUS_DESCRIPTIONS[statusKey]}</DialogDescription>
          </DialogHeader>

          <p className="text-sm font-medium text-slate-700">
            {totalCount === 0 ? "None right now" : `${totalCount} ${totalCount === 1 ? "item" : "items"}`}
          </p>

          {totalCount === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No rooms or reservations match this status.
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredRooms.map((room) => (
                <RoomRow key={room.id} room={room} status={statusKey} onSelect={onSelectRoom ? handleSelect : undefined} />
              ))}
              {unassignedArrivals.map((arrival) => (
                <UnassignedArrivalRow key={arrival.confirmationCode} arrival={arrival} />
              ))}
            </ul>
          )}

          {onSelectRoom && totalCount > 0 ? (
            <p className="text-xs text-slate-500">Tap a room to open its details on the floor plan.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
