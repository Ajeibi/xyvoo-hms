"use client";

import { useMemo } from "react";
import type {
  FrontDeskBoardData,
  FrontDeskCalendarWeek,
  FrontDeskRoomBoardItem,
} from "@/lib/hms/front-desk-board";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { CalendarDays, LayoutGrid } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
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
                    isToday && "border-b-2 border-b-sky-600 bg-sky-50",
                  )}
                >
                  <p className="text-xs font-medium text-slate-600">
                    {weekday}
                    {isToday ? <span className="sr-only"> (today)</span> : null}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-sm font-semibold tabular-nums",
                      isToday ? "text-sky-800" : "text-slate-900",
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
                aria-label={`${stay.guestName}${stay.roomCode ? `, room ${stay.roomCode}` : ""}. Show details`}
                className="z-10 m-0.5 flex min-h-9 items-center truncate rounded-lg border border-sky-300 bg-sky-100 px-2 text-left text-xs font-medium text-sky-950 shadow-sm hover:bg-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
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

  const agenda = showAgenda ? (
    <FrontDeskTodayAgenda
      arrivals={data.arrivalsToday}
      departures={data.departuresToday}
      embedded={embedded}
      onSelectItem={(id) => handleStay(id)}
    />
  ) : null;

  if (embedded) {
    return (
      <div className="space-y-5">
        <section className="overflow-hidden">
          <p className="mb-3 text-sm text-slate-600">Each bar is a stay across the days it covers. Select a bar for details.</p>
          <WeekCalendarGrid week={data.calendarWeek} onSelectStay={handleStay} />
        </section>
        {agenda}
      </div>
    );
  }

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="rooms"
        title="Booking calendar"
        description="Who is staying this week, and in which room."
        actions={
          <Link
            href={`/hms/${slug}/frontdesk`}
            className={`${hmsButton.secondary} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Room board
          </Link>
        }
      />

      <HmsCard
        id="calendar-week"
        icon={CalendarDays}
        meaning="rooms"
        title="This week"
        description="Each bar is a stay across the days it covers. Select a bar for details."
      >
        {data.calendarWeek.stays.length === 0 ? (
          <HmsEmptyState bare art="page" meaning="rooms" title="No stays this week" description="Bookings for this week will show here as bars across the days they cover." />
        ) : (
          <WeekCalendarGrid week={data.calendarWeek} onSelectStay={handleStay} />
        )}
      </HmsCard>

      {agenda}
    </HmsPage>
  );
}
