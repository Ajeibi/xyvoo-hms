"use client";

import type { RoomsSummary } from "@/lib/hms/rooms-workbench";
import {
  FRONT_DESK_ACCENT_BORDER_CLASS,
  FRONT_DESK_ACCENT_WELL_CLASS,
} from "@/lib/hms/frontdesk-capabilities";
import { cn } from "@/lib/utils";

const CARDS: {
  key: keyof RoomsSummary;
  title: string;
  detail: string;
  accent: keyof typeof FRONT_DESK_ACCENT_BORDER_CLASS;
  filter?: string;
}[] = [
  { key: "totalRooms", title: "Total rooms", detail: "Inventory", accent: "admin" },
  { key: "availableRooms", title: "Available", detail: "Ready for sale", accent: "checkin", filter: "available" },
  { key: "occupiedRooms", title: "Occupied", detail: "In-house", accent: "checkin", filter: "occupied" },
  { key: "reservedRooms", title: "Reserved", detail: "Upcoming", accent: "admin", filter: "reserved" },
  { key: "dirtyRooms", title: "Dirty", detail: "Needs cleaning", accent: "incidents", filter: "dirty" },
  { key: "maintenanceRooms", title: "Maintenance", detail: "Unavailable", accent: "rooms", filter: "maintenance" },
  { key: "outOfServiceRooms", title: "Out of service", detail: "Blocked", accent: "incidents", filter: "outOfService" },
  {
    key: "priorityCleaning",
    title: "Priority cleans",
    detail: "HK flagged",
    accent: "guest",
    filter: "priorityClean",
  },
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {CARDS.map((c) => {
        const isActive =
          c.filter &&
          (c.filter === "occupied"
            ? activeFilter === "occupied"
            : c.filter === "priorityClean"
              ? activeFilter === "priorityClean"
              : activeFilter === c.filter);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => (c.filter ? onFilter(isActive ? "" : c.filter) : undefined)}
            className={cn(
              "rounded-2xl border border-l-4 bg-white p-4 text-left shadow-sm transition-shadow",
              FRONT_DESK_ACCENT_BORDER_CLASS[c.accent],
              c.filter && "cursor-pointer hover:shadow-md",
              isActive && "ring-2 ring-blue-500/40",
            )}
          >
            <div
              className={cn(
                "mb-2 inline-flex h-9 min-w-[2.5rem] items-center justify-center rounded-xl px-2",
                FRONT_DESK_ACCENT_WELL_CLASS[c.accent],
              )}
            >
              <span className="text-lg font-bold text-slate-800">{summary[c.key]}</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">{c.title}</p>
            <p className="text-xs text-slate-500">{c.detail}</p>
          </button>
        );
      })}
    </div>
  );
}
