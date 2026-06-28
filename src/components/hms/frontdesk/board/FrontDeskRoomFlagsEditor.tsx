"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomUnitFlags } from "@/lib/hms/front-desk-board";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/app-toast";

export function FrontDeskRoomFlagsEditor({
  slug,
  roomCode,
  flags,
}: {
  slug: string;
  roomCode: string;
  flags: RoomUnitFlags;
}) {
  const router = useRouter();
  const [state, setState] = useState(flags);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/room-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          roomCode,
          dnd: state.dnd,
          securityHold: state.securityHold,
          staffRestricted: state.staffRestricted,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toastError("Could not save room flags", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Room flags updated");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-100 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Room flags</p>
      <div className="mt-3 space-y-2 text-sm">
        {(
          [
            ["dnd", "Do not disturb"],
            ["securityHold", "Security hold"],
            ["staffRestricted", "Staff restricted"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state[key]}
              onChange={(e) => setState((s) => ({ ...s, [key]: e.target.checked }))}
            />
            {label}
          </label>
        ))}
      </div>
      <Button type="button" size="sm" className="mt-3" disabled={busy} onClick={() => void save()}>
        Save flags
      </Button>
    </div>
  );
}
