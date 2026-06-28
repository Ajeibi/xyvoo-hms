"use client";

import type { FrontDeskMovementItem, FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { cn } from "@/lib/utils";

export function FrontDeskTodayAgenda({
  arrivals,
  departures,
  embedded = false,
  onSelectItem,
}: {
  arrivals: FrontDeskMovementItem[];
  departures: FrontDeskMovementItem[];
  embedded?: boolean;
  onSelectItem?: (reservationId: string, room?: FrontDeskRoomBoardItem | null) => void;
}) {
  const agenda = [...arrivals, ...departures].sort((a, b) => a.timeIso.localeCompare(b.timeIso));

  const sectionClass = embedded
    ? "mt-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50"
    : "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm";

  return (
    <section className={sectionClass} aria-label="Today's agenda">
      <div className={cn("border-b border-slate-100", embedded ? "px-4 py-3" : "px-6 py-4")}>
        <h2 className="text-sm font-semibold text-slate-900">Today&apos;s agenda</h2>
        <p className="mt-0.5 text-xs text-slate-500">Arrivals and departures scheduled for today</p>
      </div>
      {agenda.length === 0 ? (
        <p className={cn("text-sm text-slate-500", embedded ? "px-4 py-8" : "px-6 py-10")}>
          No movements scheduled for today.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {agenda.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              {onSelectItem ? (
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-wrap items-center gap-3 text-left text-sm hover:bg-slate-50",
                    embedded ? "px-4 py-3" : "gap-4 px-6 py-4",
                  )}
                  onClick={() => onSelectItem(item.id)}
                >
                  <AgendaRowContent item={item} />
                </button>
              ) : (
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-3 text-sm",
                    embedded ? "px-4 py-3" : "gap-4 px-6 py-4",
                  )}
                >
                  <AgendaRowContent item={item} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AgendaRowContent({ item }: { item: FrontDeskMovementItem }) {
  return (
    <>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
          item.kind === "arrival" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
        }`}
      >
        {item.kind}
      </span>
      <span className="font-medium text-slate-900">{item.guestName}</span>
      <span className="text-slate-500">{item.roomCode ? `Room ${item.roomCode}` : "TBD"}</span>
      <span className="text-slate-500">{formatBoardDateTime(item.timeIso)}</span>
    </>
  );
}
