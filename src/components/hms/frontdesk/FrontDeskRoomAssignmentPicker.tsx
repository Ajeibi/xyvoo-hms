"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  canAssignRoomUnit,
  groupRoomUnitsByFloor,
  type CheckInRoomUnit,
} from "@/lib/hms/check-in-room-units";
import { FRONT_DESK_PICKER_POPOVER_CLASS, FRONT_DESK_PICKER_TRIGGER_CLASS } from "@/components/hms/frontdesk/front-desk-picker-ui";
import { cn } from "@/lib/utils";

type FrontDeskRoomAssignmentPickerProps = {
  rooms: CheckInRoomUnit[];
  /** When set, only inventory keys with this `room_type_code` are listed. */
  roomTypeCode?: string;
  roomTypeName?: string;
  name: string;
  value: string;
  onChange: (roomCode: string) => void;
  id?: string;
};

function rowKind(status: string): "occupied" | "blocked" | "ok" {
  const s = status.toLowerCase();
  if (s === "occupied") return "occupied";
  if (s === "maintenance" || s === "out_of_order") return "blocked";
  return "ok";
}

export function FrontDeskRoomAssignmentPicker({
  rooms,
  roomTypeCode,
  roomTypeName,
  name,
  value,
  onChange,
  id,
}: FrontDeskRoomAssignmentPickerProps) {
  const [open, setOpen] = useState(false);

  const visibleRooms = useMemo(() => {
    const filter = roomTypeCode?.trim();
    if (!filter) return rooms;
    return rooms.filter((r) => r.roomTypeCode === filter);
  }, [rooms, roomTypeCode]);

  const floors = useMemo(() => groupRoomUnitsByFloor(visibleRooms), [visibleRooms]);
  const selected = value ? rooms.find((r) => r.roomCode === value) : undefined;

  const triggerLabel = selected
    ? `${selected.roomCode} (Floor ${typeof selected.floor === "number" ? selected.floor : "—"})${
        selected.roomTypeName ? ` · ${selected.roomTypeName}` : ""
      }`
    : "— Select later —";

  return (
    <div className="space-y-0">
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            className={cn(FRONT_DESK_PICKER_TRIGGER_CLASS)}
          >
            <span className="truncate text-left">{triggerLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(FRONT_DESK_PICKER_POPOVER_CLASS)}
          align="start"
        >
          <div className="p-1">
            {visibleRooms.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">
                {rooms.length === 0
                  ? "No room keys in inventory yet."
                  : roomTypeName
                    ? `No ${roomTypeName} rooms available to assign.`
                    : "No rooms match the selected type."}
              </p>
            ) : (
              <>
            <button
              type="button"
              className={cn(
                "w-full rounded-lg px-2 py-2 text-left text-sm text-slate-800 hover:bg-slate-100",
                !value && "bg-slate-50 font-medium",
              )}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              — Select later —
            </button>
            {floors.map(({ floor, rooms: floorRooms }, floorIdx) => (
              <div
                key={floor}
                className={floorIdx > 0 ? "mt-1 border-t border-slate-100 pt-1" : "mt-1"}
              >
                <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Floor {floor}
                </div>
                <ul className="space-y-0.5">
                  {floorRooms.map((r) => {
                    const assignable = canAssignRoomUnit(r.status);
                    const kind = rowKind(r.status);
                    const isSelected = value === r.roomCode && assignable;

                    return (
                      <li key={r.roomCode}>
                        <button
                          type="button"
                          disabled={!assignable}
                          className={cn(
                            "flex w-full flex-col rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                            assignable && "hover:bg-slate-100",
                            kind === "occupied" &&
                              "cursor-not-allowed bg-rose-50 text-rose-900 hover:bg-rose-50/90",
                            kind === "blocked" &&
                              !isSelected &&
                              "cursor-not-allowed bg-amber-50/90 text-amber-950 hover:bg-amber-50",
                            isSelected && "bg-sky-50 font-medium text-sky-950 hover:bg-sky-50",
                          )}
                          onClick={() => {
                            if (!assignable) return;
                            onChange(r.roomCode);
                            setOpen(false);
                          }}
                        >
                          <span className="font-medium tabular-nums">{r.roomCode}</span>
                          {kind === "occupied" ? (
                            <span className="text-xs text-rose-700/90">Occupied — cannot assign</span>
                          ) : kind === "blocked" ? (
                            <span className="text-xs text-amber-900/80">Unavailable</span>
                          ) : (
                            <span className="text-xs text-slate-600">
                              {r.roomTypeName ? `${r.roomTypeName} · ` : null}
                              <span className="capitalize">{r.status.replace(/_/g, " ")}</span>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
