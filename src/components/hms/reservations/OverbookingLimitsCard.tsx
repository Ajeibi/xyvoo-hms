"use client";

import { useEffect, useId, useState } from "react";
import { Layers } from "lucide-react";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";

type Row = { id: string; name: string; rooms: number; overbookRooms: number };

/**
 * How many rooms above its stock each room type may sell. Zero means never sell more than the
 * rooms there are. A booking over the limit is refused unless a manager overrides it.
 */
export function OverbookingLimitsCard({ slug }: { slug: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/reservations/limits?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setRows(data.roomTypes ?? []);
        setCanManage(Boolean(data.canManage));
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const save = async (roomTypeCode: string, overbookRooms: number) => {
    const res = await fetch("/api/hotel/reservations/limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, roomTypeCode, overbookRooms }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Not saved", data.error ?? "Please try again.");
      return false;
    }
    setRows(data.roomTypes ?? []);
    toastSuccess("Saved", "The overbooking limit is saved.");
    return true;
  };

  return (
    <HmsCard
      id="overbooking-limits"
      icon={Layers}
      meaning="rooms"
      title="Overbooking"
      description="How many rooms above its stock a room type may sell, to allow for no-shows. Leave it at 0 to never sell more rooms than you have. Past the limit a booking is refused unless a manager overrides it."
    >
      {!loaded ? (
        <p role="status" className="text-sm text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">Add your room types in settings first.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((r) => (
            <LimitRow key={r.id} row={r} canManage={canManage} onSave={(n) => save(r.id, n)} />
          ))}
        </ul>
      )}
      {!canManage && loaded ? <p className="mt-2 text-xs text-slate-600">Only an owner or admin can change these.</p> : null}
    </HmsCard>
  );
}

function LimitRow({ row, canManage, onSave }: { row: Row; canManage: boolean; onSave: (n: number) => Promise<boolean> }) {
  const id = useId();
  const [value, setValue] = useState(String(row.overbookRooms));
  const [busy, setBusy] = useState(false);
  const changed = Number(value) !== row.overbookRooms;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div>
        <p className="font-medium text-slate-900">{row.name}</p>
        <p className="text-slate-600">
          {row.rooms} room{row.rooms === 1 ? "" : "s"}
          {row.overbookRooms > 0 ? `, up to ${row.rooms + row.overbookRooms} sold` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-slate-700">
          Extra rooms allowed
        </label>
        <input
          id={id}
          type="number"
          min={0}
          max={200}
          inputMode="numeric"
          value={value}
          disabled={!canManage || busy}
          onChange={(e) => setValue(e.target.value)}
          className={`${hmsInput} w-20`}
        />
        {canManage ? (
          <button
            type="button"
            className={hmsButton.small}
            disabled={busy || !changed || value === "" || Number(value) < 0}
            onClick={async () => {
              setBusy(true);
              await onSave(Math.round(Number(value)));
              setBusy(false);
            }}
          >
            Save
          </button>
        ) : null}
      </div>
    </li>
  );
}
