"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AssignableRoomOption } from "@/lib/hms/arrivals-workbench";
import { assignRoomApi, FrontDeskAssignRoomPicker } from "./FrontDeskAssignRoomPicker";

export function FrontDeskAssignRoomDialog({
  slug,
  open,
  onOpenChange,
  reservationId,
  confirmationCode,
  guestName,
  roomTypeCode,
  currentRoomUnitId,
  onAssigned,
  canOverrideRoom,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string | null;
  confirmationCode: string;
  guestName: string;
  roomTypeCode: string;
  currentRoomUnitId: string | null;
  onAssigned: () => void;
  canOverrideRoom: boolean;
}) {
  const [assignableRooms, setAssignableRooms] = useState<AssignableRoomOption[]>([]);
  const [roomUnitId, setRoomUnitId] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !reservationId) return;
    setError(null);
    setManagerPin("");
    setLoading(true);
    fetch(`/api/hotel/frontdesk/arrivals/${reservationId}?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setAssignableRooms(d.assignableRooms ?? []);
        setRoomUnitId(d.reservation.roomUnitId ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load rooms"))
      .finally(() => setLoading(false));
  }, [open, reservationId, slug]);

  async function handleAssign() {
    if (!reservationId || !roomUnitId) return;
    setLoading(true);
    setError(null);
    const result = await assignRoomApi({
      slug,
      reservationId,
      roomUnitId,
      managerPin: managerPin || undefined,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Assignment failed");
      return;
    }
    onAssigned();
    onOpenChange(false);
  }

  if (!reservationId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign room — {confirmationCode}</DialogTitle>
          <DialogDescription>{guestName}</DialogDescription>
        </DialogHeader>
        {loading && assignableRooms.length === 0 ? (
          <p className="text-sm text-slate-500">Loading rooms…</p>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <FrontDeskAssignRoomPicker
          slug={slug}
          reservationId={reservationId}
          roomTypeCode={roomTypeCode}
          assignableRooms={assignableRooms}
          roomUnitId={roomUnitId}
          onRoomUnitIdChange={setRoomUnitId}
          managerPin={managerPin}
          onManagerPinChange={setManagerPin}
          canOverrideRoom={canOverrideRoom}
          floorFilter={floorFilter}
          onFloorFilterChange={setFloorFilter}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => handleAssign()} disabled={loading || !roomUnitId}>
            Assign room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
