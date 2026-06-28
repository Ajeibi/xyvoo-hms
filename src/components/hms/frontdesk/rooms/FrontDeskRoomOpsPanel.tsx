"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RoomsRoleCapabilities } from "@/lib/hms/rooms-rbac";
import type { FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import type { RoomSuggestion } from "@/lib/hms/rooms-ai";
import { useRoomsMutation } from "./useRoomsMutation";
import { AssignPanel } from "./ops/AssignPanel";
import { BlockPanel } from "./ops/BlockPanel";
import { MovePanel } from "./ops/MovePanel";
import { ConnectingPanel } from "./ops/ConnectingPanel";
import { PriorityCleanPanel } from "./ops/PriorityCleanPanel";
import { UnlockKeyPanel } from "./ops/UnlockKeyPanel";
import { ManagerPinField } from "./ops/ManagerPinField";
import { ROOM_OPS_TITLES, type RoomOpsAction, type RoomOption } from "./ops/types";

export type { RoomOpsAction } from "./ops/types";

export function FrontDeskRoomOpsPanel({
  capabilities,
  selectedRoom,
  onOpenAction,
}: {
  slug: string;
  capabilities: RoomsRoleCapabilities;
  selectedRoom: FrontDeskRoomBoardItem | null;
  onRefresh: () => void;
  onOpenAction: (action: RoomOpsAction, room?: FrontDeskRoomBoardItem | null) => void;
}) {
  const actions: { key: RoomOpsAction; label: string; enabled: boolean }[] = [
    { key: "change-assignment", label: "Change assignment", enabled: capabilities.canAssignRoom },
    { key: "block", label: "Block room", enabled: capabilities.canBlockRoom },
    { key: "move", label: "Room move", enabled: capabilities.canMoveGuest },
    { key: "priority-clean", label: "Priority clean", enabled: capabilities.canPriorityClean },
    { key: "unlock", label: "Remote unlock", enabled: capabilities.canRemoteUnlock },
    { key: "key-reissue", label: "Lost key / reissue", enabled: capabilities.canKeyReissue },
    { key: "connecting", label: "Connecting rooms", enabled: capabilities.canManageConnecting },
  ];

  return (
    <section
      className={
        selectedRoom
          ? "rounded-2xl border-[3px] border-blue-600 bg-blue-50/80 p-4 shadow-md shadow-blue-200/50"
          : "rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4"
      }
    >
      <h2 className="text-sm font-semibold text-slate-900">Room operations</h2>
      <p className="mt-1 text-xs text-slate-600">
        {selectedRoom ? (
          <>
            Acting on{" "}
            <span className="font-bold text-blue-800">Room {selectedRoom.roomCode}</span>
            {selectedRoom.stay?.guestName || selectedRoom.reservedStay?.guestName
              ? ` · ${selectedRoom.stay?.guestName ?? selectedRoom.reservedStay?.guestName}`
              : null}
          </>
        ) : (
          "Click a room on the floor plan below, then choose an operation"
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.key}
            type="button"
            size="sm"
            variant="outline"
            disabled={!a.enabled}
            onClick={() => onOpenAction(a.key, selectedRoom)}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

export function FrontDeskRoomOpsDialog({
  slug,
  action,
  room,
  open,
  onOpenChange,
  onSuccess,
}: {
  slug: string;
  action: RoomOpsAction | null;
  room: FrontDeskRoomBoardItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [assignTargetRoomId, setAssignTargetRoomId] = useState("");
  const [targetRoomId, setTargetRoomId] = useState("");
  const [targetRoomSearch, setTargetRoomSearch] = useState("");
  const [priority, setPriority] = useState("urgent");
  const [blockType, setBlockType] = useState("temporary");
  const [roomBCode, setRoomBCode] = useState("");
  const [roomOptions, setRoomOptions] = useState<RoomOption[]>([]);
  const [connectingLinks, setConnectingLinks] = useState<
    { id: string; roomA?: { room_code: string }; roomB?: { room_code: string } }[]
  >([]);
  const [suggestions, setSuggestions] = useState<RoomSuggestion[]>([]);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [dueBy, setDueBy] = useState("");
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [activeBlocks, setActiveBlocks] = useState<{ id: string; reason: string; block_type: string }[]>([]);
  const mutation = useRoomsMutation();
  const { loading, error, requiresPin, managerPin, setManagerPin, setError, run } = mutation;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setProviderMessage(null);
    if (room?.stay?.reservationId) setReservationId(room.stay.reservationId);
    if (room?.reservedStay?.reservationId) setReservationId(room.reservedStay.reservationId);
    fetch(`/api/hotel/frontdesk/rooms/connecting?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setConnectingLinks(d.links ?? []))
      .catch(() => setConnectingLinks([]));
    if (room) {
      fetch(`/api/hotel/frontdesk/rooms/${room.id}?slug=${encodeURIComponent(slug)}`)
        .then((r) => r.json())
        .then((d) => setActiveBlocks(d.blocks ?? []))
        .catch(() => setActiveBlocks([]));
    }
    fetch(`/api/hotel/frontdesk/rooms?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const list: RoomOption[] = [];
        const byFloor = data.board?.roomsByFloor ?? {};
        for (const floorRooms of Object.values(byFloor) as FrontDeskRoomBoardItem[][]) {
          for (const r of floorRooms) {
            list.push({ id: r.id, roomCode: r.roomCode, displayStatus: r.displayStatus });
          }
        }
        list.sort((a, b) => a.roomCode.localeCompare(b.roomCode, undefined, { numeric: true }));
        setRoomOptions(list);
      })
      .catch(() => setRoomOptions([]));
  }, [open, slug, room?.id, room?.stay?.reservationId, room?.reservedStay?.reservationId, setError]);

  useEffect(() => {
    if (!open || !reservationId || action !== "change-assignment") return;
    fetch(
      `/api/hotel/frontdesk/rooms/suggest-assignment?slug=${encodeURIComponent(slug)}&reservationId=${reservationId}`,
    )
      .then((r) => r.json())
      .then((d) => setSuggestions(d.suggestions ?? []))
      .catch(() => setSuggestions([]));
  }, [open, slug, reservationId, action]);

  const filteredTargetRooms = useMemo(() => {
    const q = targetRoomSearch.trim().toLowerCase();
    return roomOptions.filter((r) => {
      if (room && r.id === room.id) return false;
      if (!q) return true;
      return r.roomCode.toLowerCase().includes(q);
    });
  }, [roomOptions, targetRoomSearch, room]);

  const connectingMatch = useMemo(() => {
    const code = roomBCode.trim().toLowerCase();
    if (!code) return null;
    return roomOptions.find((r) => r.roomCode.toLowerCase() === code) ?? null;
  }, [roomBCode, roomOptions]);

  const connectingHint = roomBCode.trim()
    ? connectingMatch
      ? `Will link to ${connectingMatch.roomCode}`
      : "No matching room found"
    : null;

  async function submit() {
    if (!room && action !== "connecting") return;
    if (action === "change-assignment") return;
    let ok = false;
    if (action === "block" && room) {
      const result = await run(
        `/api/hotel/frontdesk/rooms/${room.id}/block`,
        "POST",
        {
          slug,
          blockType,
          reason,
          startAt: blockStart ? new Date(blockStart).toISOString() : undefined,
          endAt: blockEnd ? new Date(blockEnd).toISOString() : null,
        },
        { successMessage: "Room blocked", errorTitle: "Could not block room" },
      );
      ok = result.ok;
    } else if (action === "priority-clean" && room) {
      const result = await run(
        `/api/hotel/frontdesk/rooms/${room.id}/priority-clean`,
        "POST",
        {
          slug,
          priorityLevel: priority,
          notes: reason,
          ...(dueBy ? { dueBy: new Date(dueBy).toISOString() } : {}),
        },
        { successMessage: "Priority clean scheduled", errorTitle: "Could not schedule clean" },
      );
      ok = result.ok;
    } else if (action === "unlock" && room) {
      const result = await run(
        `/api/hotel/frontdesk/rooms/${room.id}/unlock`,
        "POST",
        { slug, reason, confirm: true },
        { successMessage: "Remote unlock sent", errorTitle: "Remote unlock failed" },
      );
      if (result.data.message) setProviderMessage(String(result.data.message));
      ok = result.ok;
    } else if (action === "key-reissue" && room) {
      const result = await run(
        `/api/hotel/frontdesk/rooms/${room.id}/key-reissue`,
        "POST",
        {
          slug,
          reason,
          reservationId: room.stay?.reservationId || undefined,
        },
        { successMessage: "Key reissue requested", errorTitle: "Key reissue failed" },
      );
      if (result.data.message) setProviderMessage(String(result.data.message));
      ok = result.ok;
    } else if (action === "move" && room?.stay && targetRoomId) {
      const result = await run(
        `/api/hotel/frontdesk/rooms/${room.id}/move`,
        "POST",
        {
          slug,
          reservationId: room.stay.reservationId,
          newRoomUnitId: targetRoomId,
          reason,
        },
        { successMessage: "Guest moved to new room", errorTitle: "Room move failed" },
      );
      ok = result.ok;
    } else if (action === "connecting" && room && connectingMatch) {
      const result = await run(
        `/api/hotel/frontdesk/rooms/connecting`,
        "POST",
        {
          slug,
          roomUnitIdA: room.id,
          roomUnitIdB: connectingMatch.id,
        },
        { successMessage: "Connecting rooms linked", errorTitle: "Could not link rooms" },
      );
      ok = result.ok;
    } else {
      setError("Missing required fields.");
      return;
    }
    if (ok) {
      onSuccess();
      onOpenChange(false);
      setReason("");
      setTargetRoomId("");
      setTargetRoomSearch("");
      setRoomBCode("");
    }
  }

  async function unlinkConnecting(linkId: string) {
    const result = await run(
      `/api/hotel/frontdesk/rooms/connecting`,
      "DELETE",
      { slug, linkId },
      { successMessage: "Connecting link removed", errorTitle: "Could not remove link" },
    );
    if (result.ok) onSuccess();
  }

  async function deactivateBlock(blockId: string) {
    if (!room) return;
    const result = await run(
      `/api/hotel/frontdesk/rooms/${room.id}/block`,
      "PATCH",
      { slug, blockId, active: false },
      { successMessage: "Room block removed", errorTitle: "Could not remove block" },
    );
    if (result.ok) {
      setActiveBlocks((prev) => prev.filter((b) => b.id !== blockId));
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{action ? ROOM_OPS_TITLES[action] : "Operation"}</DialogTitle>
        </DialogHeader>
        {room ? (
          <p className="text-sm text-slate-600">
            Room <span className="font-semibold text-slate-900">{room.roomCode}</span>
            {room.stay ? ` · ${room.stay.guestName}` : null}
          </p>
        ) : null}
        {error && action !== "change-assignment" ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : null}
        <div className="space-y-3">
          {action === "change-assignment" ? (
            <AssignPanel
              slug={slug}
              reservationId={reservationId}
              onReservationIdChange={setReservationId}
              assignTargetRoomId={assignTargetRoomId}
              onAssignTargetRoomIdChange={setAssignTargetRoomId}
              suggestions={suggestions}
              mutation={mutation}
              onAssigned={() => {
                onSuccess();
                onOpenChange(false);
              }}
            />
          ) : null}
          {action === "move" ? (
            <MovePanel
              targetRoomSearch={targetRoomSearch}
              onTargetRoomSearchChange={setTargetRoomSearch}
              targetRoomId={targetRoomId}
              onTargetRoomIdChange={setTargetRoomId}
              filteredRooms={filteredTargetRooms}
            />
          ) : null}
          {action === "connecting" ? (
            <ConnectingPanel
              roomBCode={roomBCode}
              onRoomBCodeChange={setRoomBCode}
              connectingHint={connectingHint}
              connectingLinks={connectingLinks}
              onUnlink={unlinkConnecting}
            />
          ) : null}
          {action === "priority-clean" ? (
            <PriorityCleanPanel
              priority={priority}
              onPriorityChange={setPriority}
              dueBy={dueBy}
              onDueByChange={setDueBy}
            />
          ) : null}
          {action === "unlock" ? <UnlockKeyPanel slug={slug} action="unlock" /> : null}
          {action === "key-reissue" ? <UnlockKeyPanel slug={slug} action="key-reissue" /> : null}
          {providerMessage ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {providerMessage}
            </p>
          ) : null}
          {action === "block" ? (
            <BlockPanel
              blockType={blockType}
              onBlockTypeChange={setBlockType}
              blockStart={blockStart}
              onBlockStartChange={setBlockStart}
              blockEnd={blockEnd}
              onBlockEndChange={setBlockEnd}
              activeBlocks={activeBlocks}
              onDeactivateBlock={deactivateBlock}
            />
          ) : null}
          {action !== "change-assignment" ? (
            <>
              <ManagerPinField
                requiresPin={requiresPin}
                managerPin={managerPin}
                onManagerPinChange={setManagerPin}
              />
              <Input
                placeholder="Reason / notes"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </>
          ) : null}
        </div>
        {action !== "change-assignment" ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={loading}>
              {loading ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
