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
import { BedDouble } from "lucide-react";
import { HmsAlert, HmsIconBadge } from "@/components/hms/hms-ui";
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
        <DialogHeader className="flex-row items-start gap-3 space-y-0 text-left">
          <HmsIconBadge icon={BedDouble} meaning="rooms" />
          <div className="min-w-0">
            <DialogTitle className="font-heading">Assign a room · {confirmationCode}</DialogTitle>
            <DialogDescription className="text-slate-600">{guestName}</DialogDescription>
          </div>
        </DialogHeader>
        {loading && assignableRooms.length === 0 ? (
          <p role="status" className="text-sm text-slate-600">
            Loading rooms…
          </p>
        ) : null}
        {error ? <HmsAlert message={error} /> : null}
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
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl font-semibold" onClick={() => handleAssign()} disabled={loading || !roomUnitId}>
            Assign room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
