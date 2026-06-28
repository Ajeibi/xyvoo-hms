"use client";

import { useMemo } from "react";
import type {
  FrontDeskBoardData,
  FrontDeskCalendarWeek,
  FrontDeskRoomBoardItem,
} from "@/lib/hms/front-desk-board";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { FrontDeskTodayAgenda } from "./FrontDeskTodayAgenda";

function dayIndex(iso: string, dayStarts: string[]) {
  const d = iso.slice(0, 10);
  const idx = dayStarts.indexOf(d);
  if (idx >= 0) return idx;
  for (let i = 0; i < dayStarts.length; i += 1) {
    if (d >= dayStarts[i] && (i === dayStarts.length - 1 || d < dayStarts[i + 1])) return i;
  }
  return 0;
}

type PlacedStay = FrontDeskCalendarWeek["stays"][number] & {
  row: number;
  colStart: number;
  colEnd: number;
};

function placeStaysOnGrid(week: FrontDeskCalendarWeek): PlacedStay[] {
  const sorted = [...week.stays].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const placed: PlacedStay[] = [];

  for (const stay of sorted) {
    const startIdx = dayIndex(stay.startDate, week.dayStarts);
    const endIdx = Math.min(6, dayIndex(stay.endDate, week.dayStarts));
    const colStart = startIdx + 1;
    const colEnd = endIdx + 2;

    let row = 0;
    while (
      placed.some(
        (p) => p.row === row && !(p.colEnd <= colStart || p.colStart >= colEnd),
      )
    ) {
      row += 1;
    }
    placed.push({ ...stay, row, colStart, colEnd });
  }

  return placed;
}

function WeekCalendarGrid({
  week,
  onSelectStay,
}: {
  week: FrontDeskCalendarWeek;
  onSelectStay?: (reservationId: string) => void;
}) {
  const placed = useMemo(() => placeStaysOnGrid(week), [week]);
  const rowCount = Math.max(3, placed.reduce((max, s) => Math.max(max, s.row + 1), 0));
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {week.dayLabels.map((label, i) => {
              const isToday = week.dayStarts[i] === todayIso;
              const weekday = label.split(",")[0]?.trim() ?? label;
              const datePart = label.includes(",") ? label.split(",").slice(1).join(",").trim() : label;
              return (
                <div
                  key={week.dayStarts[i]}
                  className={cn(
                    "border-r border-slate-200 px-2 py-2.5 text-center last:border-r-0",
                    isToday && "bg-blue-50",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{weekday}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-sm font-semibold tabular-nums",
                      isToday ? "text-blue-700" : "text-slate-900",
                    )}
                  >
                    {datePart}
                  </p>
                </div>
              );
            })}
          </div>

          <div
            className="relative grid grid-cols-7 gap-px bg-slate-200 p-px"
            style={{ gridTemplateRows: `repeat(${rowCount}, minmax(2.5rem, auto))` }}
          >
            {Array.from({ length: rowCount * 7 }, (_, i) => {
              const col = i % 7;
              const row = Math.floor(i / 7);
              const isToday = week.dayStarts[col] === todayIso;
              return (
                <div
                  key={`cell-${row}-${col}`}
                  className={cn(
                    "min-h-10 bg-white",
                    isToday && "bg-blue-50/40",
                    row < rowCount - 1 && "border-b border-slate-100",
                  )}
                  style={{ gridColumn: col + 1, gridRow: row + 1 }}
                  aria-hidden
                />
              );
            })}

            {placed.map((stay) => (
              <button
                key={stay.reservationId}
                type="button"
                onClick={() => onSelectStay?.(stay.reservationId)}
                className="z-10 m-0.5 flex min-h-9 items-center truncate rounded-md border border-blue-200 bg-blue-100 px-2 text-left text-[11px] font-medium text-blue-900 shadow-sm hover:bg-blue-200"
                style={{
                  gridColumn: `${stay.colStart} / ${stay.colEnd}`,
                  gridRow: stay.row + 1,
                }}
                title={`${stay.guestName}${stay.roomCode ? ` · Room ${stay.roomCode}` : ""}`}
              >
                <span className="truncate">
                  {stay.guestName}
                  {stay.roomCode ? ` · ${stay.roomCode}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FrontDeskReservationCalendar({
  slug,
  data,
  embedded = false,
  roomsByFloor,
  onSelectStay,
  showAgenda = true,
}: {
  slug: string;
  data: FrontDeskBoardData;
  embedded?: boolean;
  roomsByFloor?: Record<number, FrontDeskRoomBoardItem[]>;
  onSelectStay?: (reservationId: string, room?: FrontDeskRoomBoardItem | null) => void;
  showAgenda?: boolean;
}) {
  const handleStay = (reservationId: string) => {
    const room = Object.values(roomsByFloor ?? {})
      .flat()
      .find(
        (r) =>
          r.stay?.reservationId === reservationId ||
          r.reservedStay?.reservationId === reservationId,
      );
    onSelectStay?.(reservationId, room ?? null);
  };

  const wrapperClass = embedded ? "space-y-5" : "mx-auto w-full max-w-[1200px] px-6 py-8 sm:px-8";

  return (
    <div className={wrapperClass}>
      {!embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Front desk</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Reservation calendar</h1>
          </div>
          <Link
            href={`/hms/${slug}/frontdesk`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Grid view
          </Link>
        </div>
      ) : null}

      <section className={cn("overflow-hidden", embedded ? "" : "mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm")}>
        {!embedded ? (
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Week view</h2>
            <p className="mt-0.5 text-xs text-slate-500">Stays spanning each day — click a bar for details</p>
          </div>
        ) : (
          <p className="mb-3 text-xs text-slate-500">Stays spanning each day — click a bar for details</p>
        )}
        <div className={embedded ? "" : "p-4"}>
          <WeekCalendarGrid week={data.calendarWeek} onSelectStay={handleStay} />
        </div>
      </section>

      {showAgenda ? (
        <FrontDeskTodayAgenda
          arrivals={data.arrivalsToday}
          departures={data.departuresToday}
          embedded={embedded}
          onSelectItem={(id) => handleStay(id)}
        />
      ) : null}
    </div>
  );
}
