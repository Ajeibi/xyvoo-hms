"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ListFilter, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { HmsCard, HmsField, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import type { RoomsWorkbenchPayload } from "@/lib/hms/rooms-workbench";
import type { RoomsRoleCapabilities } from "@/lib/hms/rooms-rbac";
import type { FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { FrontDeskRoomsSummaryCards } from "./FrontDeskRoomsSummaryCards";
import { FrontDeskRoomBoardShell } from "./FrontDeskRoomBoardShell";
import { FrontDeskRoomDetailSheet } from "./FrontDeskRoomDetailSheet";
import {
  FrontDeskRoomOpsDialog,
  FrontDeskRoomOpsPanel,
  type RoomOpsAction,
} from "./FrontDeskRoomOpsPanel";
import {
  CAPABILITY_TO_OPS_ACTION,
  FrontDeskMaintenanceInsights,
} from "./FrontDeskMaintenanceInsights";
import { cn } from "@/lib/utils";
import { StaleDataNotice } from "@/components/hms/StaleDataNotice";

function canMutateRooms(caps: RoomsRoleCapabilities) {
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

export function FrontDeskRoomsClient({
  slug,
  tenantId,
  initial,
  capabilities,
  layoutTitleVariant = "frontdesk",
}: {
  slug: string;
  tenantId: string;
  initial: RoomsWorkbenchPayload;
  capabilities: RoomsRoleCapabilities;
  /** Use `topNav` when rendering under `/hms/[slug]/rooms` so the kicker matches the sidebar. */
  layoutTitleVariant?: "frontdesk" | "topNav";
}) {
  const searchParams = useSearchParams();
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [roomTypeFilter, setRoomTypeFilter] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  // Set when a refresh fails: when the board on screen was last loaded successfully.
  const [lastGoodAt, setLastGoodAt] = useState(() => new Date());
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<FrontDeskRoomBoardItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [opsAction, setOpsAction] = useState<RoomOpsAction | null>(null);
  const [opsOpen, setOpsOpen] = useState(false);

  const roomTypes = useMemo(() => {
    const codes = new Set<string>();
    for (const rooms of Object.values(data.board.roomsByFloor)) {
      for (const r of rooms) codes.add(r.roomTypeCode);
    }
    return [...codes].sort();
  }, [data.board.roomsByFloor]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ slug });
    if (search.trim()) params.set("q", search.trim());
    if (floorFilter) params.set("floor", floorFilter);
    if (roomTypeFilter) params.set("roomType", roomTypeFilter);
    if (vipOnly) params.set("vipOnly", "true");
    if (statusFilter === "occupied") params.set("occupied", "true");
    else if (statusFilter === "priorityClean") params.set("priorityCleanOnly", "true");
    else if (statusFilter) params.set("displayStatus", statusFilter);
    try {
      const res = await fetch(`/api/hotel/frontdesk/rooms?${params}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json && !json.error) {
        setData(json);
        setLastGoodAt(new Date());
        setRefreshFailed(false);
      } else {
        setRefreshFailed(true);
      }
    } catch {
      setRefreshFailed(true);
    } finally {
      setLoading(false);
    }
  }, [slug, search, statusFilter, floorFilter, roomTypeFilter, vipOnly]);

  useEffect(() => {
    const t = setTimeout(refresh, 300);
    return () => clearTimeout(t);
  }, [refresh]);

  useFrontDeskRealtime(tenantId, true, refresh, { routerRefresh: false, debounceMs: 800 });

  const allRooms = useMemo(
    () => Object.values(data.board.roomsByFloor).flat(),
    [data.board.roomsByFloor],
  );

  useEffect(() => {
    const actionKey = searchParams.get("action");
    const roomId = searchParams.get("roomId");
    if (roomId && !selectedRoom) {
      const found = allRooms.find((r) => r.id === roomId);
      if (found) setSelectedRoom(found);
    }
    if (actionKey && CAPABILITY_TO_OPS_ACTION[actionKey]) {
      setOpsAction(CAPABILITY_TO_OPS_ACTION[actionKey]);
      setOpsOpen(true);
    }
  }, [searchParams, allRooms, selectedRoom]);

  function selectRoom(room: FrontDeskRoomBoardItem) {
    setSelectedRoom(room);
    setSheetOpen(true);
  }

  function selectRoomById(roomUnitId: string) {
    const found = allRooms.find((r) => r.id === roomUnitId);
    if (found) selectRoom(found);
  }

  function clearSelection() {
    setSelectedRoom(null);
    setSheetOpen(false);
  }

  function openOp(action: RoomOpsAction, room?: FrontDeskRoomBoardItem | null) {
    if (room) setSelectedRoom(room);
    setOpsAction(action);
    setOpsOpen(true);
  }

  const showOps = canMutateRooms(capabilities);
  const eyebrow = layoutTitleVariant === "topNav" ? "Rooms" : "Front desk";

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <HmsPageHeader
        eyebrow={eyebrow}
        meaning="rooms"
        title="Rooms"
        description={
          layoutTitleVariant === "topNav"
            ? "See which rooms are free, taken or being cleaned, and look after them. Room types and prices are set in Settings."
            : "See which rooms are free, taken or being cleaned, and look after them."
        }
        actions={
          <button type="button" className={hmsButton.secondary} onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      <HmsSectionIntro
        id="frontdesk-rooms"
        meaning="rooms"
        art="box"
        title="What you can do here"
        points={[
          "Tap a figure to show only those rooms, such as the ones that need cleaning.",
          "Select a room on the floor plan to see who is in it and what it needs.",
          "Move a guest, block a room for repairs or ask for a priority clean.",
        ]}
      />

      {refreshFailed ? (
        <StaleDataNotice what="the rooms" since={lastGoodAt} onRetry={refresh} retrying={loading} />
      ) : null}

      <FrontDeskRoomsSummaryCards
        summary={data.summary}
        activeFilter={statusFilter}
        onFilter={setStatusFilter}
      />

      <FrontDeskMaintenanceInsights slug={slug} onSelectRoom={selectRoomById} />

      <HmsCard id="rooms-filters" icon={ListFilter} meaning="rooms" title="Find a room">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="rooms-search" className="mb-1 block text-sm font-medium text-slate-800">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <Input
                id="rooms-search"
                type="search"
                className="h-11 rounded-xl border-slate-300 pl-10"
                placeholder="Room number, guest name or room type"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <HmsField id="rooms-floor" label="Floor">
            <select
              id="rooms-floor"
              className={cn(hmsInput, "cursor-pointer")}
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
            >
              <option value="">All floors</option>
              {data.board.floors.map((f) => (
                <option key={f} value={String(f)}>
                  Floor {f}
                </option>
              ))}
            </select>
          </HmsField>
          <HmsField id="rooms-type" label="Room type">
            <select
              id="rooms-type"
              className={cn(hmsInput, "cursor-pointer")}
              value={roomTypeFilter}
              onChange={(e) => setRoomTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              {roomTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </HmsField>
          <HmsField id="rooms-status" label="Status">
            <select
              id="rooms-status"
              className={cn(hmsInput, "cursor-pointer")}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="inHouse">Guests staying</option>
              <option value="overdueCheckout">Overdue check-out</option>
              <option value="reserved">Reserved</option>
              <option value="dirty">Dirty</option>
              <option value="maintenance">Maintenance</option>
              <option value="outOfService">Out of service</option>
              <option value="priorityClean">Priority clean</option>
            </select>
          </HmsField>
          <div className="flex items-end">
            <label className="flex h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-800 focus-within:ring-2 focus-within:ring-blue-500">
              <input
                type="checkbox"
                checked={vipOnly}
                onChange={(e) => setVipOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              VIP guests only
            </label>
          </div>
        </div>
      </HmsCard>

      <div className="relative" aria-busy={loading}>
        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60" aria-hidden>
            <RefreshCw className="h-8 w-8 animate-spin text-sky-700" />
          </div>
        ) : null}
        <FrontDeskRoomBoardShell
          slug={slug}
          data={data.board}
          mode="rooms"
          selectedRoom={selectedRoom}
          onClearSelection={clearSelection}
          onViewSelectedDetails={() => selectedRoom && setSheetOpen(true)}
          beforeFloorPlan={
            showOps ? (
              <FrontDeskRoomOpsPanel
                slug={slug}
                capabilities={capabilities}
                selectedRoom={selectedRoom}
                onRefresh={refresh}
                onOpenAction={openOp}
              />
            ) : (
              <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                You can look at the rooms here. Ask a manager if you need to move guests or block rooms.
              </p>
            )
          }
          onSelectRoom={selectRoom}
          onRoomAction={(action, r) => openOp(action, r)}
          showCalendar={false}
          showAgenda={false}
        />
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
        onSuccess={refresh}
      />
    </div>
  );
}
