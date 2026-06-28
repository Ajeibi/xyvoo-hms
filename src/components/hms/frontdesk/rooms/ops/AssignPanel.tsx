"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RoomSuggestion } from "@/lib/hms/rooms-ai";
import type { AssignableRoomOption } from "@/lib/hms/arrivals-workbench";
import type { useRoomsMutation } from "../useRoomsMutation";

type SearchHit = {
  reservationId: string;
  confirmationCode: string;
  guestName: string;
};

export function AssignPanel({
  slug,
  reservationId,
  onReservationIdChange,
  assignTargetRoomId,
  onAssignTargetRoomIdChange,
  suggestions,
  mutation,
  onAssigned,
}: {
  slug: string;
  reservationId: string;
  onReservationIdChange: (id: string) => void;
  assignTargetRoomId: string;
  onAssignTargetRoomIdChange: (id: string) => void;
  suggestions: RoomSuggestion[];
  mutation: ReturnType<typeof useRoomsMutation>;
  onAssigned: () => void;
}) {
  const { loading, error, setError, run } = mutation;
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [assignable, setAssignable] = useState<AssignableRoomOption[]>([]);

  useEffect(() => {
    if (!reservationId) {
      setAssignable([]);
      return;
    }
    fetch(
      `/api/hotel/frontdesk/rooms/assignable?slug=${encodeURIComponent(slug)}&reservationId=${reservationId}`,
    )
      .then((r) => r.json())
      .then((d) => setAssignable(d.assignableRooms ?? []))
      .catch(() => setAssignable([]));
  }, [slug, reservationId]);

  async function assignToRoom(roomUnitId: string, roomCode: string) {
    if (!reservationId) {
      setError("Select a reservation first.");
      return;
    }
    const result = await run(
      `/api/hotel/frontdesk/rooms/${roomUnitId}/assign`,
      "PATCH",
      {
        slug,
        reservationId,
        roomUnitId,
        reason: `Assigned to ${roomCode}`,
      },
      {
        successMessage: `Room ${roomCode} assigned`,
        errorTitle: "Could not assign room",
      },
    );
    if (result.ok) onAssigned();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-600">Find reservation</p>
      <div className="flex gap-2">
        <Input
          placeholder="Confirmation or guest name…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            if (!searchQ.trim()) return;
            const res = await fetch(
              `/api/hotel/folio/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(searchQ.trim())}`,
            );
            const data = await res.json();
            const hits: SearchHit[] = (data.results ?? []).map(
              (r: { reservationId: string; confirmationCode: string; guestName: string }) => ({
                reservationId: r.reservationId,
                confirmationCode: r.confirmationCode,
                guestName: r.guestName,
              }),
            );
            setSearchHits(hits.slice(0, 8));
          }}
        >
          Search
        </Button>
      </div>
      {searchHits.length > 0 ? (
        <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border bg-slate-50 p-2 text-xs">
          {searchHits.map((h) => (
            <li key={h.reservationId}>
              <button
                type="button"
                className="w-full text-left hover:text-blue-700"
                onClick={() => {
                  onReservationIdChange(h.reservationId);
                  setSearchHits([]);
                }}
              >
                {h.confirmationCode} · {h.guestName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs font-medium text-slate-600">Reservation ID</p>
      <Input
        placeholder="Reservation UUID"
        value={reservationId}
        onChange={(e) => onReservationIdChange(e.target.value)}
      />
      {suggestions.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">Suggested rooms</p>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <Button
                key={s.roomUnitId}
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void assignToRoom(s.roomUnitId, s.roomCode)}
              >
                {s.roomCode} ({s.score})
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {assignable.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">Assignable rooms</p>
          <select
            className="h-10 w-full rounded-lg border border-input px-3 text-sm"
            value={assignTargetRoomId}
            onChange={(e) => onAssignTargetRoomIdChange(e.target.value)}
          >
            <option value="">Select room…</option>
            {assignable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.roomCode} · {r.readiness}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!assignTargetRoomId || loading}
            onClick={() => {
              const code = assignable.find((r) => r.id === assignTargetRoomId)?.roomCode ?? "";
              void assignToRoom(assignTargetRoomId, code);
            }}
          >
            Assign to selected room
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
