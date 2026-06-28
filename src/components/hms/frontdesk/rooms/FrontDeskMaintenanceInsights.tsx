"use client";

import { useEffect, useState } from "react";
import type { MaintenanceInsight } from "@/lib/hms/rooms-ai";

export function FrontDeskMaintenanceInsights({
  slug,
  onSelectRoom,
}: {
  slug: string;
  onSelectRoom: (roomUnitId: string) => void;
}) {
  const [insights, setInsights] = useState<MaintenanceInsight[]>([]);

  useEffect(() => {
    fetch(`/api/hotel/frontdesk/rooms/maintenance-insights?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setInsights(d.insights ?? []))
      .catch(() => setInsights([]));
  }, [slug]);

  if (insights.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="text-sm font-semibold text-amber-950">Rooms needing attention</h2>
      <p className="mt-1 text-xs text-amber-800">Predictive signals from incidents and blocks</p>
      <ul className="mt-3 space-y-2">
        {insights.slice(0, 5).map((i) => (
          <li key={i.roomUnitId}>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-2 rounded-lg border border-amber-200/80 bg-white px-3 py-2 text-left text-sm hover:bg-amber-50"
              onClick={() => onSelectRoom(i.roomUnitId)}
            >
              <span>
                <span className="font-semibold text-slate-900">Room {i.roomCode}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{i.signals.join(" · ")}</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  i.severity === "high"
                    ? "bg-red-100 text-red-800"
                    : i.severity === "medium"
                      ? "bg-amber-100 text-amber-900"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {i.severity}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const CAPABILITY_TO_OPS_ACTION: Record<string, import("./FrontDeskRoomOpsPanel").RoomOpsAction> = {
  "change-room-assignment": "change-assignment",
  "block-room": "block",
  "remote-unlock": "unlock",
  "priority-clean-request": "priority-clean",
  "lost-key-reissue": "key-reissue",
  "room-move": "move",
  "connecting-rooms": "connecting",
};
