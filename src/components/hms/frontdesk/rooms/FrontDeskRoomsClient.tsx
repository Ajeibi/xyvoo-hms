"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      const json = await res.json();
      if (!json.error) setData(json);
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
    <div className="space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</p>
          <h1 className="text-2xl font-bold text-slate-900">Room management</h1>
          <p className="mt-1 text-sm text-slate-600">
            {layoutTitleVariant === "topNav" ? (
              <>
                Monitor availability, assignments, cleaning status, and room operations — same view
                as reception. Configure room types and rates in Settings.
              </>
            ) : (
              <>Monitor availability, assignments, cleaning status, and room operations.</>
            )}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </header>

      <FrontDeskRoomsSummaryCards
        summary={data.summary}
        activeFilter={statusFilter}
        onFilter={setStatusFilter}
      />

      <FrontDeskMaintenanceInsights slug={slug} onSelectRoom={selectRoomById} />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-11 pl-10"
              placeholder="Search room, guest, type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-11 cursor-pointer rounded-lg border border-input bg-white px-3 text-sm"
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
          <select
            className="h-11 cursor-pointer rounded-lg border border-input bg-white px-3 text-sm"
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
          <select
            className="h-11 cursor-pointer rounded-lg border border-input bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="inHouse">In-house</option>
            <option value="overdueCheckout">Overdue checkout</option>
            <option value="reserved">Reserved</option>
            <option value="dirty">Dirty</option>
            <option value="maintenance">Maintenance</option>
            <option value="outOfService">Out of service</option>
            <option value="priorityClean">Priority clean</option>
          </select>
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-white px-3 text-sm">
            <input
              type="checkbox"
              checked={vipOnly}
              onChange={(e) => setVipOnly(e.target.checked)}
              className="rounded"
            />
            VIP only
          </label>
        </div>
      </section>

      <div className="relative">
        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
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
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Read-only access — you can view rooms but cannot run operations.
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
