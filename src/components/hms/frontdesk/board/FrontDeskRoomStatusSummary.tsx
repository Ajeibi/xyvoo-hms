"use client";

import { useState } from "react";
import type {
  FrontDeskPendingArrivalItem,
  FrontDeskRoomBoardItem,
  FrontDeskSummaryCounts,
} from "@/lib/hms/front-desk-board";
import { SUMMARY_CARD_CLASS, SUMMARY_CARD_LABELS } from "./status-styles";
import {
  FrontDeskRoomStatusDetailDialog,
  type RoomStatusSummaryKey,
} from "./FrontDeskRoomStatusDetailDialog";
import { cn } from "@/lib/utils";

const SUMMARY_KEYS = [
  "overdueCheckout",
  "available",
  "reserved",
  "dirty",
  "maintenance",
  "inHouse",
  "outOfService",
] as const satisfies RoomStatusSummaryKey[];

export function FrontDeskRoomStatusSummary({
  counts,
  rooms,
  pendingArrivals = [],
  onSelectRoom,
}: {
  counts: FrontDeskSummaryCounts;
  rooms: FrontDeskRoomBoardItem[];
  pendingArrivals?: FrontDeskPendingArrivalItem[];
  onSelectRoom?: (room: FrontDeskRoomBoardItem) => void;
}) {
  const [activeStatus, setActiveStatus] = useState<RoomStatusSummaryKey | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openStatus(key: RoomStatusSummaryKey) {
    setActiveStatus(key);
    setDialogOpen(true);
  }

  return (
    <>
      <section
        className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/25 sm:p-7"
        aria-label="Room status summary"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Room status</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Status summary</h2>
        <p className="mt-1 text-sm text-slate-500">Click a card to see which rooms match.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SUMMARY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => openStatus(key)}
              className={cn(
                "overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-sm transition-all",
                "cursor-pointer hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
              )}
              aria-label={`${SUMMARY_CARD_LABELS[key]}: ${counts[key]}. View details.`}
            >
              <div className={`h-1.5 ${SUMMARY_CARD_CLASS[key]}`} aria-hidden />
              <div className="px-4 py-4">
                <p className="text-3xl font-semibold tabular-nums text-slate-900">{counts[key]}</p>
                <p className="mt-1 text-xs font-medium leading-snug text-slate-600">{SUMMARY_CARD_LABELS[key]}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <FrontDeskRoomStatusDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        statusKey={activeStatus}
        rooms={rooms}
        pendingArrivals={pendingArrivals}
        onSelectRoom={onSelectRoom}
      />
    </>
  );
}
