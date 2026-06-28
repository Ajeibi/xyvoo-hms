"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { roomTypeGridAbbrev } from "@/lib/hms/room-pricing";
import {
  buildUpdatesFromRange,
  countInventoryByRoomTypeId,
  validateInventoryTypeUpdates,
} from "@/lib/hms/room-inventory-type-caps";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";

export type InventoryUnitRow = {
  id: string;
  room_code: string;
  floor: number;
  room_type_code: string;
};

type RoomTypeOption = {
  id: string;
  name: string;
  abbrev: string;
  rooms: number;
};

type Props = {
  slug: string;
  inventoryRoomCount: number;
  roomTypeOptions: RoomTypeOption[];
};

export function RoomInventoryTypeAssignment({ slug, inventoryRoomCount, roomTypeOptions }: Props) {
  const [units, setUnits] = useState<InventoryUnitRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  /** Which save is in flight (spinners on range vs bulk). */
  const [savingOp, setSavingOp] = useState<"range" | "bulk" | null>(null);

  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeTypeId, setRangeTypeId] = useState("");

  const [bulkTypeId, setBulkTypeId] = useState("");

  const abbrevByTypeId = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of roomTypeOptions) m.set(o.id, o.abbrev);
    return m;
  }, [roomTypeOptions]);

  const validTypeIds = useMemo(() => new Set(roomTypeOptions.map((o) => o.id)), [roomTypeOptions]);

  const assignedCounts = useMemo(
    () => countInventoryByRoomTypeId(units, validTypeIds),
    [units, validTypeIds],
  );

  const roomTypesForCaps = useMemo(
    () => roomTypeOptions.map((o) => ({ id: o.id, name: o.name, rooms: o.rooms })),
    [roomTypeOptions],
  );

  const formatTypeLabel = (t: RoomTypeOption) => {
    const assigned = assignedCounts.get(t.id) ?? 0;
    return `${t.name} (${t.abbrev}) · ${assigned}/${t.rooms}`;
  };

  const overCapTypes = useMemo(
    () =>
      roomTypeOptions.filter((t) => (assignedCounts.get(t.id) ?? 0) > t.rooms).map((t) => ({
        name: t.name,
        assigned: assignedCounts.get(t.id) ?? 0,
        cap: t.rooms,
      })),
    [roomTypeOptions, assignedCounts],
  );

  const duplicateAbbrevs = useMemo(() => {
    const counts = new Map<string, string[]>();
    for (const o of roomTypeOptions) {
      const k = o.abbrev.toUpperCase();
      const arr = counts.get(k) ?? [];
      arr.push(o.name);
      counts.set(k, arr);
    }
    return [...counts.entries()].filter(([, names]) => names.length > 1);
  }, [roomTypeOptions]);

  const loadUnits = useCallback(async () => {
    if (inventoryRoomCount <= 0) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/hotel/room-inventory-types?slug=${encodeURIComponent(slug)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error || "Could not load room keys.");
        setUnits([]);
        return;
      }
      setUnits(Array.isArray(data.units) ? data.units : []);
    } finally {
      setLoading(false);
    }
  }, [slug, inventoryRoomCount]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  const byFloor = useMemo(() => {
    const floors = [...new Set(units.map((u) => u.floor))].sort((a, b) => a - b);
    const out: Record<number, InventoryUnitRow[]> = {};
    for (const f of floors) {
      out[f] = units
        .filter((u) => u.floor === f)
        .sort((a, b) => a.room_code.localeCompare(b.room_code, undefined, { numeric: true }));
    }
    return out;
  }, [units]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectFloor = (floor: number) => {
    const list = byFloor[floor] ?? [];
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = list.length > 0 && list.every((u) => next.has(u.id));
      if (allSelected) {
        for (const u of list) next.delete(u.id);
      } else {
        for (const u of list) next.add(u.id);
      }
      return next;
    });
  };

  const postUpdates = async (body: Record<string, unknown>, op: "range" | "bulk") => {
    setSavingOp(op);
    setSaving(true);
    setActionError("");
    try {
      const res = await fetch("/api/hotel/room-inventory-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || "Update failed.";
        setActionError(msg);
        toastError("Could not update room keys", msg);
        return;
      }
      const count = data.updated ?? 0;
      toastSuccess(`Updated ${count} room key(s)`);
      setUnits(Array.isArray(data.units) ? data.units : []);
      setSelected(new Set());
    } finally {
      setSaving(false);
      setSavingOp(null);
    }
  };

  const applyRange = async () => {
    const from = parseInt(rangeFrom, 10);
    const to = parseInt(rangeTo, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      setActionError("Enter numeric From and To (e.g. 101 and 110).");
      return;
    }
    if (!rangeTypeId) {
      setActionError("Choose a room type for the range.");
      return;
    }
    const updates = buildUpdatesFromRange(units, from, to, rangeTypeId);
    if (updates.size === 0) {
      setActionError("No room keys matched that number range.");
      return;
    }
    const check = validateInventoryTypeUpdates(roomTypesForCaps, units, updates);
    if (!check.ok) {
      setActionError(check.error);
      return;
    }
    await postUpdates({ ranges: [{ from, to, roomTypeId: rangeTypeId }] }, "range");
  };

  const applyBulkSelected = async () => {
    if (selected.size === 0) {
      setActionError("Select one or more rooms on the grid (click cells).");
      return;
    }
    if (!bulkTypeId) {
      setActionError("Choose a room type to assign to the selection.");
      return;
    }
    const updates = new Map(
      [...selected].map((roomUnitId) => [roomUnitId, bulkTypeId] as const),
    );
    const check = validateInventoryTypeUpdates(roomTypesForCaps, units, updates);
    if (!check.ok) {
      setActionError(check.error);
      return;
    }
    await postUpdates(
      {
        assignments: [...selected].map((roomUnitId) => ({ roomUnitId, roomTypeId: bulkTypeId })),
      },
      "bulk",
    );
  };

  if (inventoryRoomCount <= 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Physical keys &amp; room types</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          When your property has room keys in inventory, you can map each key to a room type here (by range or
          multi-select). Save room types above first so type ids stay in sync.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Physical keys → room types</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Assign each room number to a configured type. Each type is limited to the{" "}
            <span className="font-medium text-slate-700">Number of rooms</span> set above (e.g. Super
            Standard 18/18). Use <span className="font-medium text-slate-700">number ranges</span> or{" "}
            <span className="font-medium text-slate-700">click multiple cells</span> then assign in one
            action.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadUnits()}
          disabled={loading || saving}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {overCapTypes.length > 0 ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-900">
          <span className="font-semibold">Over assigned: </span>
          {overCapTypes.map((t) => (
            <span key={t.name} className="ml-1">
              {t.name} ({t.assigned}/{t.cap})
            </span>
          ))}
          <span className="ml-1">— reassign keys or increase the type count above, then save.</span>
        </div>
      ) : null}

      {roomTypeOptions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {roomTypeOptions.map((t) => {
            const assigned = assignedCounts.get(t.id) ?? 0;
            const complete = assigned === t.rooms;
            const over = assigned > t.rooms;
            return (
              <span
                key={t.id}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums",
                  over
                    ? "border-rose-300 bg-rose-50 text-rose-900"
                    : complete
                      ? "border-green-300 bg-green-50 font-semibold text-green-800 ring-1 ring-green-200"
                      : "border-slate-200 bg-slate-50 text-slate-700",
                )}
              >
                {t.name}: {assigned}/{t.rooms}
              </span>
            );
          })}
        </div>
      ) : null}

      {duplicateAbbrevs.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">Duplicate grid labels: </span>
          {duplicateAbbrevs.map(([abbr, names]) => (
            <span key={abbr} className="ml-1">
              “{abbr}” ({names.join(", ")}) — set unique Grid labels on those types.
            </span>
          ))}
        </div>
      ) : null}

      {loadError ? (
        <p className="mt-3 text-sm text-rose-600">{loadError}</p>
      ) : loading && units.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Loading room keys…</p>
      ) : null}

      {units.length > 0 ? (
        <>
          <div
            className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:flex-row sm:flex-wrap sm:items-end"
            aria-busy={saving}
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600">
                From #
                <input
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ""))}
                  disabled={saving}
                  className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="100"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600">
                To #
                <input
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ""))}
                  disabled={saving}
                  className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="110"
                />
              </label>
              <label className="flex min-w-[10rem] flex-col gap-0.5 text-xs font-medium text-slate-600">
                Type
                <select
                  value={rangeTypeId}
                  onChange={(e) => setRangeTypeId(e.target.value)}
                  disabled={saving}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select…</option>
                  {roomTypeOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {formatTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => void applyRange()}
                className="inline-flex min-h-[2.25rem] min-w-[7.5rem] items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingOp === "range" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                    <span>Updating…</span>
                  </>
                ) : (
                  "Apply range"
                )}
              </button>
            </div>
            <div className="hidden h-8 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
            <div className="flex flex-1 flex-wrap items-end gap-2">
              <p className="text-[11px] text-slate-500 sm:mr-2">
                Selected: <span className="font-semibold text-slate-800">{selected.size}</span>
              </p>
              <select
                value={bulkTypeId}
                onChange={(e) => setBulkTypeId(e.target.value)}
                disabled={saving}
                className="min-w-[10rem] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Assign selection to…</option>
                {roomTypeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {formatTypeLabel(t)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving}
                onClick={() => void applyBulkSelected()}
                className="inline-flex min-h-[2.25rem] min-w-[9.5rem] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                {savingOp === "bulk" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                    <span>Updating…</span>
                  </>
                ) : (
                  "Apply to selected"
                )}
              </button>
            </div>
          </div>

          {saving ? (
            <div
              className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-600" aria-hidden />
              <span>Updating room types…</span>
            </div>
          ) : null}

          {actionError ? <p className="mt-2 text-sm text-rose-600">{actionError}</p> : null}

          <div className="mt-4 space-y-5">
            {Object.entries(byFloor)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([floorStr, list]) => {
                const floor = Number(floorStr);
                const allOn = list.length > 0 && list.every((u) => selected.has(u.id));
                return (
                  <div key={floor}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Floor {floor} · {list.length} keys
                      </p>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => selectFloor(floor)}
                        className="text-xs font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                      >
                        {allOn ? "Clear floor" : "Select whole floor"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {list.map((u) => {
                        const isSel = selected.has(u.id);
                        const ab = abbrevByTypeId.get(u.room_type_code) ?? u.room_type_code.slice(0, 4);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => toggle(u.id)}
                            disabled={saving}
                            className={cn(
                              "flex min-w-[4.5rem] flex-col rounded-lg border px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                              isSel
                                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                                : "border-slate-200 bg-white hover:border-slate-300",
                            )}
                          >
                            <span className="font-bold tabular-nums text-slate-900">{u.room_code}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-tight text-slate-500">
                              {ab}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function buildRoomTypeOptionsFromDrafts(
  drafts: Array<{ id: string; name: string; shortLabel: string; rooms: string }>,
): RoomTypeOption[] {
  return drafts.map((d) => ({
    id: d.id,
    name: d.name.trim() || "Unnamed",
    abbrev: roomTypeGridAbbrev({
      name: d.name.trim() || "Room",
      shortLabel: d.shortLabel?.trim() || undefined,
    }),
    rooms: Math.max(1, Number.parseInt(d.rooms, 10) || 1),
  }));
}
