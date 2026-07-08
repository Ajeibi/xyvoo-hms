"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import type { FrontDeskBoardData, FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import { FrontDeskSelectedRoomCallout } from "./FrontDeskSelectedRoomCallout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { FrontDeskRoomStatusSummary } from "../board/FrontDeskRoomStatusSummary";
import { FrontDeskFloorTabs } from "../board/FrontDeskFloorTabs";
import { FrontDeskRoomGrid } from "../board/FrontDeskRoomGrid";
import { FrontDeskBoardLegend } from "../board/FrontDeskBoardLegend";
import { FrontDeskRealtimeRefresh } from "../board/FrontDeskRealtimeRefresh";
import { FrontDeskReservationCalendar } from "../FrontDeskReservationCalendar";
import { FrontDeskTodayAgenda } from "../FrontDeskTodayAgenda";
import type { RoomOpsAction } from "./ops/types";

export function FrontDeskRoomBoardShell({
  slug,
  data,
  mode = "overview",
  onSelectRoom,
  selectedRoom = null,
  onClearSelection,
  onViewSelectedDetails,
  beforeFloorPlan,
  onRoomAction,
  showCalendar = true,
  showAgenda = true,
  showOccupancy = false,
}: {
  slug: string;
  data: FrontDeskBoardData;
  mode?: "overview" | "rooms";
  onSelectRoom: (room: FrontDeskRoomBoardItem) => void;
  selectedRoom?: FrontDeskRoomBoardItem | null;
  onClearSelection?: () => void;
  onViewSelectedDetails?: () => void;
  beforeFloorPlan?: ReactNode;
  onRoomAction?: (action: RoomOpsAction, room: FrontDeskRoomBoardItem) => void;
  showCalendar?: boolean;
  showAgenda?: boolean;
  showOccupancy?: boolean;
}) {
  const [activeFloor, setActiveFloor] = useState(data.floors[0] ?? 1);
  const [viewMode, setViewMode] = useState<"grid" | "calendar">("grid");

  useEffect(() => {
    if (selectedRoom?.floor != null && data.floors.includes(selectedRoom.floor)) {
      setActiveFloor(selectedRoom.floor);
    }
  }, [selectedRoom?.id, selectedRoom?.floor, data.floors]);

  const hasInventory = data.floors.length > 0;
  if (!hasInventory) return null;

  const roomsOnFloor = data.roomsByFloor[activeFloor] ?? [];
  const allRooms = Object.values(data.roomsByFloor).flat();

  return (
    <TooltipProvider>
      <div className={mode === "rooms" ? "space-y-4" : "space-y-6"}>
        <FrontDeskRoomStatusSummary
          counts={data.summaryCounts}
          rooms={allRooms}
          pendingArrivals={data.pendingCheckInsToday}
          onSelectRoom={(room) => {
            onSelectRoom(room);
            if (room.floor != null && data.floors.includes(room.floor)) {
              setActiveFloor(room.floor);
            }
          }}
        />

        {beforeFloorPlan}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Floor plan
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Room grid</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedRoom
                  ? "Selected room is highlighted on the grid below."
                  : "Click a room to select it — the cell will pulse with a blue ring."}
                {data.tenantId ? <FrontDeskRealtimeRefresh tenantId={data.tenantId} /> : null}
              </p>
            </div>
            {showCalendar ? (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <Button
                  type="button"
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 rounded-md"
                  onClick={() => setViewMode("grid")}
                >
                  Grid
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "calendar" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 rounded-md"
                  onClick={() => setViewMode("calendar")}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Calendar
                </Button>
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-4">
            {selectedRoom && onClearSelection ? (
              <FrontDeskSelectedRoomCallout
                room={selectedRoom}
                onClear={onClearSelection}
                onViewDetails={onViewSelectedDetails}
              />
            ) : null}

            {viewMode === "grid" || !showCalendar ? (
              <>
                <FrontDeskFloorTabs floors={data.floors} activeFloor={activeFloor} onChange={setActiveFloor} />
                <FrontDeskRoomGrid
                  rooms={roomsOnFloor}
                  selectedRoomId={selectedRoom?.id}
                  onSelectRoom={onSelectRoom}
                  onRoomAction={onRoomAction}
                />
                <FrontDeskBoardLegend />
              </>
            ) : (
              <FrontDeskReservationCalendar
                slug={slug}
                data={data}
                embedded
                showAgenda={false}
                roomsByFloor={data.roomsByFloor}
                onSelectStay={(_id, room) => {
                  if (room) onSelectRoom(room);
                }}
              />
            )}

            {showAgenda ? (
              <FrontDeskTodayAgenda
                arrivals={data.arrivalsToday}
                departures={data.departuresToday}
                embedded
                onSelectItem={(reservationId) => {
                  const room = Object.values(data.roomsByFloor)
                    .flat()
                    .find(
                      (r) =>
                        r.stay?.reservationId === reservationId ||
                        r.reservedStay?.reservationId === reservationId,
                    );
                  if (room) onSelectRoom(room);
                }}
              />
            ) : null}
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}
