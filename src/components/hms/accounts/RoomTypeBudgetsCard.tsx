"use client";

import { useState } from "react";
import { BedDouble } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { spreadEvenly } from "@/lib/hms/account-budgets";
import { roomTypeMonths, type RoomTypeBudgetRow } from "@/lib/hms/room-type-budgets";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Room revenue budget for each room type, by month. Feeds the "Room revenue by room type" report. */
export function RoomTypeBudgetsCard({ slug, initialGrid, initialYear, canEdit }: { slug: string; initialGrid: RoomTypeBudgetRow[]; initialYear: number; canEdit: boolean }) {
  const [year, setYear] = useState(initialYear);
  const [grid, setGrid] = useState(initialGrid);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const loadYear = async (y: number) => {
    setYear(y);
    const res = await fetch(`/api/hotel/accounts/room-type-budgets?${new URLSearchParams({ slug, year: String(y) })}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setGrid(data.rows);
      setDirty(new Set());
    }
  };

  const setCell = (id: string, month: number, value: string) => {
    setGrid((g) => g.map((r) => (r.roomTypeId === id ? { ...r, months: r.months.map((m, i) => (i === month ? Math.max(0, Number(value) || 0) : m)) } : r)));
    setDirty((d) => new Set(d).add(`${id}|${month}`));
  };

  const spread = (id: string, total: number) => {
    const parts = spreadEvenly(total);
    setGrid((g) => g.map((r) => (r.roomTypeId === id ? { ...r, months: parts } : r)));
    setDirty((d) => {
      const n = new Set(d);
      for (let i = 0; i < 12; i++) n.add(`${id}|${i}`);
      return n;
    });
  };

  const save = async () => {
    const months = roomTypeMonths(year);
    const entries = [...dirty].map((k) => {
      const [roomTypeId, i] = k.split("|");
      return { roomTypeId, month: months[Number(i)], amount: grid.find((r) => r.roomTypeId === roomTypeId)?.months[Number(i)] ?? 0 };
    });
    if (entries.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/accounts/room-type-budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, entries }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save room type budgets", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Room type budgets saved");
      setDirty(new Set());
    } finally {
      setBusy(false);
    }
  };

  return (
    <HmsCard
      id="room-type-budgets"
      title="Room type budgets"
      icon={BedDouble}
      meaning="money"
      flush
      actions={
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="room-type-budget-year">Year</label>
          <input id="room-type-budget-year" type="number" className={`${hmsInput} w-24`} value={year} onChange={(e) => void loadYear(Number(e.target.value))} />
          {canEdit ? (
            <button type="button" className={hmsButton.primary} disabled={busy || dirty.size === 0} onClick={() => void save()}>
              {busy ? "Saving…" : "Save room type budgets"}
            </button>
          ) : null}
        </div>
      }
    >
      {grid.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-600">No room types are set up yet. Add them in the hotel's room setup, then set a room revenue budget for each here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-275 text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Room type</th>
                {MONTH_NAMES.map((m) => (
                  <th key={m} scope="col" className="px-1 py-3 text-right">{m}</th>
                ))}
                <th scope="col" className="px-4 py-3 text-right">Year</th>
              </tr>
            </thead>
            <tbody>
              {grid.map((r) => {
                const total = r.months.reduce((s, n) => s + n, 0);
                return (
                  <tr key={r.roomTypeId} className="border-b border-slate-100">
                    <td className="px-4 py-2 text-slate-900">{r.name}</td>
                    {r.months.map((m, i) => (
                      <td key={i} className="px-1 py-2">
                        <input
                          aria-label={`${r.name}, ${MONTH_NAMES[i]}`}
                          type="number"
                          min="0"
                          disabled={!canEdit}
                          className="h-9 w-20 rounded-lg border border-slate-300 px-1.5 text-right text-sm tabular-nums disabled:bg-slate-50"
                          value={m || ""}
                          placeholder="0"
                          onChange={(e) => setCell(r.roomTypeId, i, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      {canEdit ? (
                        <input
                          aria-label={`${r.name}, whole year (spread evenly)`}
                          type="number"
                          min="0"
                          className="h-9 w-28 rounded-lg border border-slate-300 px-1.5 text-right text-sm tabular-nums"
                          value={total || ""}
                          placeholder="0"
                          onChange={(e) => spread(r.roomTypeId, Math.max(0, Number(e.target.value) || 0))}
                        />
                      ) : (
                        <span className="tabular-nums">{fmt(total)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-5 py-3 text-sm text-slate-600">Room revenue budget for each room type. Type a yearly figure in the last column to spread it evenly. Results show in Reports, Room revenue by room type.</p>
    </HmsCard>
  );
}
