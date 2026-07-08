"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FrontDeskBoardData, FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import { Button } from "@/components/ui/button";
import { FrontDeskOccupancyWidget } from "./FrontDeskOccupancyWidget";
import { FrontDeskPropertySnapshot } from "./FrontDeskPropertySnapshot";
import { FrontDeskQuickActionsBar } from "./FrontDeskQuickActionsBar";
import { FrontDeskMovementTimeline } from "./FrontDeskMovementTimeline";
import { FrontDeskAnalyticsSection } from "./FrontDeskAnalyticsSection";
import { FrontDeskShiftNotes } from "./FrontDeskShiftNotes";
import { FrontDeskActivityFeed } from "./FrontDeskActivityFeed";
import { FrontDeskRoomDetailSheet } from "../rooms/FrontDeskRoomDetailSheet";
import { FrontDeskRoomBoardShell } from "../rooms/FrontDeskRoomBoardShell";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";
import {
  FrontDeskRoomOpsDialog,
  FrontDeskRoomOpsPanel,
} from "../rooms/FrontDeskRoomOpsPanel";
import type { RoomOpsAction } from "../rooms/ops/types";
import {
  CAPABILITY_TO_OPS_ACTION,
} from "../rooms/FrontDeskMaintenanceInsights";

function canMutateRooms(caps: ReturnType<typeof getRoomsCapabilities>) {
  return (
    caps.canAssignRoom ||
    caps.canMoveGuest ||
    caps.canBlockRoom ||
    caps.canPriorityClean ||
    caps.canRemoteUnlock ||
    caps.canKeyReissue ||
    caps.canManageConnecting
  );
}

export function FrontDeskOperationalBoard({
  slug,
  data,
}: {
  slug: string;
  data: FrontDeskBoardData;
}) {
  const searchParams = useSearchParams();
  const [selectedRoom, setSelectedRoom] = useState<FrontDeskRoomBoardItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [opsAction, setOpsAction] = useState<RoomOpsAction | null>(null);
  const [opsOpen, setOpsOpen] = useState(false);
  const capabilities = getRoomsCapabilities("Front Desk");

  const allRooms = useMemo(
    () => Object.values(data.roomsByFloor).flat(),
    [data.roomsByFloor],
  );

  useEffect(() => {
    const roomId = searchParams.get("roomId");
    const actionKey = searchParams.get("action");
    if (roomId) {
      const found = allRooms.find((r) => r.id === roomId);
      if (found) setSelectedRoom(found);
    }
    if (actionKey && CAPABILITY_TO_OPS_ACTION[actionKey]) {
      setOpsAction(CAPABILITY_TO_OPS_ACTION[actionKey]);
      setOpsOpen(true);
    }
  }, [searchParams, allRooms]);

  const hasInventory = data.floors.length > 0;

  function openOp(action: RoomOpsAction, room?: FrontDeskRoomBoardItem | null) {
    if (room) setSelectedRoom(room);
    setOpsAction(action);
    setOpsOpen(true);
  }

  if (!hasInventory) {
    return (
      <section className="mt-6 overflow-hidden rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-center sm:px-8">
        <p className="text-sm font-semibold text-slate-900">No room inventory on file</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          Add physical room keys in Settings → Rooms & pricing so the floor board and status cards can load live data.
        </p>
        <Button className="mt-5" asChild>
          <Link href={`/hms/${slug}/settings#rooms-pricing-setup`}>Set up rooms</Link>
        </Button>
      </section>
    );
  }

  const showOps = canMutateRooms(capabilities);

  return (
    <>
      <div className="mt-6 space-y-6">
        <FrontDeskQuickActionsBar slug={slug} />
        <FrontDeskPropertySnapshot
          reservationRecordCount={data.reservationRecordCount}
          inHouseGuestHeadcount={data.occupancy.inHouseGuestHeadcount}
        />
        <FrontDeskOccupancyWidget stats={data.occupancy} />

        <FrontDeskRoomBoardShell
          slug={slug}
          data={data}
          mode="overview"
          selectedRoom={selectedRoom}
          onClearSelection={() => {
            setSelectedRoom(null);
            setSheetOpen(false);
          }}
          onViewSelectedDetails={() => selectedRoom && setSheetOpen(true)}
          beforeFloorPlan={
            showOps ? (
              <FrontDeskRoomOpsPanel
                slug={slug}
                capabilities={capabilities}
                selectedRoom={selectedRoom}
                onRefresh={() => window.location.reload()}
                onOpenAction={openOp}
              />
            ) : null
          }
          onSelectRoom={(room) => {
            setSelectedRoom(room);
            setSheetOpen(true);
          }}
          onRoomAction={(action, room) => openOp(action, room)}
        />

        <FrontDeskMovementTimeline
          slug={slug}
          arrivals={data.arrivalsToday}
          departures={data.departuresToday}
        />

        <FrontDeskAnalyticsSection analytics={data.analytics} />

        <FrontDeskShiftNotes slug={slug} notes={data.shiftNotes} />

        <FrontDeskActivityFeed slug={slug} items={data.auditFeed} />
      </div>

      <FrontDeskRoomDetailSheet
        slug={slug}
        room={selectedRoom}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        capabilities={capabilities}
        currency={data.currency}
        onOpenOp={(action) => {
          setSheetOpen(false);
          openOp(action, selectedRoom);
        }}
      />

      <FrontDeskRoomOpsDialog
        slug={slug}
        action={opsAction}
        room={selectedRoom}
        open={opsOpen}
        onOpenChange={setOpsOpen}
        onSuccess={() => window.location.reload()}
      />
    </>
  );
}
