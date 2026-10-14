"use client";

import {
  BedDouble,
  BedSingle,
  CalendarClock,
  CircleSlash,
  Hotel,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import type { RoomsSummary } from "@/lib/hms/rooms-workbench";
import { cn } from "@/lib/utils";

/*
 * Room counts on soft tints. The tints follow the room board's status colours
 * (board/status-styles.ts): available green, occupied blue, reserved amber, dirty orange,
 * maintenance violet. A tile with a filter is a toggle that narrows the board.
 */
const CARDS: {
  key: keyof RoomsSummary;
  title: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  iconBox: string;
  filter?: string;
}[] = [
  { key: "totalRooms", title: "All rooms", detail: "In the hotel", icon: Hotel, tint: "bg-sky-50", iconBox: "text-sky-700 ring-sky-200" },
  { key: "availableRooms", title: "Available", detail: "Ready for a guest", icon: BedSingle, tint: "bg-emerald-50", iconBox: "text-emerald-700 ring-emerald-200", filter: "available" },
  { key: "occupiedRooms", title: "Occupied", detail: "Guests staying", icon: BedDouble, tint: "bg-blue-50", iconBox: "text-blue-700 ring-blue-200", filter: "occupied" },
  { key: "reservedRooms", title: "Reserved", detail: "Booked for arrivals", icon: CalendarClock, tint: "bg-amber-50", iconBox: "text-amber-700 ring-amber-200", filter: "reserved" },
  { key: "dirtyRooms", title: "Dirty", detail: "Needs cleaning", icon: Sparkles, tint: "bg-orange-50", iconBox: "text-orange-700 ring-orange-200", filter: "dirty" },
  { key: "maintenanceRooms", title: "Maintenance", detail: "Being repaired", icon: Wrench, tint: "bg-violet-50", iconBox: "text-violet-700 ring-violet-200", filter: "maintenance" },
  { key: "outOfServiceRooms", title: "Out of service", detail: "Blocked from use", icon: CircleSlash, tint: "bg-slate-100", iconBox: "text-slate-700 ring-slate-200", filter: "outOfService" },
  { key: "priorityCleaning", title: "Priority cleans", detail: "Housekeeping flagged", icon: Zap, tint: "bg-rose-50", iconBox: "text-rose-700 ring-rose-200", filter: "priorityClean" },
];

export function FrontDeskRoomsSummaryCards({
  summary,
  activeFilter,
  onFilter,
}: {
  summary: RoomsSummary;
  activeFilter: string;
  onFilter: (status: string) => void;
}) {
  return (
    <section aria-label="Rooms at a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {CARDS.map((c) => {
        const isActive = Boolean(c.filter) && activeFilter === c.filter;
        const Icon = c.icon;
        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">{c.title}</p>
              <span aria-hidden className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1", c.iconBox)}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-0.5 font-heading text-2xl font-bold tabular-nums text-slate-900">{summary[c.key]}</p>
            <p className="mt-0.5 text-xs text-slate-600">{isActive ? "Showing only these" : c.detail}</p>
          </>
        );
        const className = cn("rounded-2xl p-4 text-left", c.tint);
        return c.filter ? (
          <button
            key={c.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onFilter(isActive ? "" : c.filter!)}
            className={cn(
              className,
              "cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              isActive && "ring-2 ring-slate-900/70",
            )}
          >
            {body}
          </button>
        ) : (
          <div key={c.key} className={className}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
