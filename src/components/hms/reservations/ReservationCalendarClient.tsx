"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Star } from "lucide-react";
import { HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { addDays, formatDayLong, formatDayShort, freeOnNight } from "@/lib/hms/reservation-availability-shared";
import type { CalendarBooking, CalendarPayload } from "@/lib/hms/reservation-calendar";

const DAY_W = 60;
const ROW_H = 38;
const LABEL_W = 148;
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";

type Proposal = { id: string; arrivalDay: string; departureDay: string; roomUnitId?: string | null };
type Drag = {
  booking: CalendarBooking;
  mode: "move" | "start" | "end";
  startX: number;
  origArr: number;
  origDep: number;
  origRow: string;
  shift: number;
  row: string;
  moved: boolean;
};
type Pending = {
  proposal: Proposal;
  lines: string[];
  note: string | null;
  error: string | null;
  canOverride: boolean;
  inHouse: boolean;
};

const unassignedKey = (typeId: string) => `unassigned:${typeId}`;

function barClasses(b: CalendarBooking) {
  if (b.status === "checked_in") return "border-emerald-400 bg-emerald-100 text-emerald-950";
  if (b.status === "checked_out") return "border-slate-300 bg-slate-100 text-slate-600";
  if (!b.roomUnitId) return "border-amber-400 bg-amber-100 text-amber-950";
  return "border-sky-400 bg-sky-100 text-sky-950";
}

/**
 * The booking calendar. Rooms down the side (grouped by type), days across, a bar per booking.
 * Drag a bar to move it, drag its ends to lengthen or shorten it, drop it on another room to
 * change room. Every change is checked first and confirmed before it is saved; the database
 * refuses a double booking whatever happens here. Select a bar for a form that does the same.
 */
export function ReservationCalendarClient({ slug, data, currency }: { slug: string; data: CalendarPayload; currency: string }) {
  const router = useRouter();
  const ids = useId();
  const { days, today } = data;
  const dayIndex = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);
  const N = days.length;

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selected, setSelected] = useState<CalendarBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [override, setOverride] = useState({ reason: "", pin: "" });
  const [range, setRange] = useState<{ row: string; a: number; b: number } | null>(null);
  const rangeRef = useRef<typeof range>(null);

  const roomById = useMemo(() => {
    const m = new Map<string, { code: string; typeId: string; typeName: string }>();
    for (const g of data.groups) for (const r of g.rooms) m.set(r.id, { code: r.code, typeId: g.typeId, typeName: g.typeName });
    return m;
  }, [data.groups]);

  const idx = (day: string) => {
    const i = dayIndex.get(day);
    if (i !== undefined) return i;
    return day < days[0] ? -1 : N + 1;
  };

  const rowOf = (b: CalendarBooking) => (b.roomUnitId && roomById.has(b.roomUnitId) ? b.roomUnitId : unassignedKey(b.roomTypeCode));

  /* ---------- ask the server what a change would do ---------- */
  const review = useCallback(
    async (b: CalendarBooking, p: Proposal) => {
      setBusy(true);
      try {
        const inHouse = b.status === "checked_in";
        const res = inHouse
          ? await fetch(`/api/hotel/frontdesk/arrivals/${b.id}/stay-change`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug, newDepartureDate: p.departureDay, preview: true }),
            })
          : await fetch(`/api/hotel/reservations/${b.id}/change`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug, arrivalDay: p.arrivalDay, departureDay: p.departureDay, roomUnitId: p.roomUnitId, preview: true }),
            });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (out.canOverride) {
            setPending({ proposal: p, lines: [], note: null, error: out.error, canOverride: true, inHouse });
            return;
          }
          toastError("Can't do that", out.error ?? "The change isn't possible.");
          setPending(null);
          return;
        }
        let lines: string[] = [];
        let note: string | null = null;
        if (inHouse) {
          const pv = out.preview as { kind: string; changeNights: number; amount: number; blocker: string | null; conflicts: { label: string }[] };
          if (pv.blocker || pv.conflicts.length) {
            toastError("Can't do that", pv.blocker ?? `The room isn't free: ${pv.conflicts.map((c) => c.label).join("; ")}.`);
            setPending(null);
            return;
          }
          lines = [`${pv.kind === "extend" ? "Extend" : "Shorten"} the stay by ${pv.changeNights} night${pv.changeNights === 1 ? "" : "s"}, to ${formatDayShort(p.departureDay)}.`];
          note = `${pv.kind === "extend" ? "Added to" : "Credited from"} the guest's bill: ${new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(pv.amount)}.`;
        } else {
          lines = out.changes ?? [];
          if (Math.abs((out.newTotal ?? 0) - (out.oldTotal ?? 0)) > 0.005) {
            const f = new Intl.NumberFormat("en-NG", { style: "currency", currency });
            note = `Room charges go from ${f.format(out.oldTotal)} to ${f.format(out.newTotal)}.`;
          }
        }
        setPending({ proposal: p, lines, note, error: null, canOverride: false, inHouse });
      } finally {
        setBusy(false);
      }
    },
    [slug, currency],
  );

  const apply = async () => {
    if (!pending) return;
    const b = data.bookings.find((x) => x.id === pending.proposal.id);
    if (!b) return;
    const p = pending.proposal;
    setBusy(true);
    try {
      const res = pending.inHouse
        ? await fetch(`/api/hotel/frontdesk/arrivals/${b.id}/stay-change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug, newDepartureDate: p.departureDay }),
          })
        : await fetch(`/api/hotel/reservations/${b.id}/change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug,
              arrivalDay: p.arrivalDay,
              departureDay: p.departureDay,
              roomUnitId: p.roomUnitId,
              sendEmail,
              overrideReason: pending.canOverride ? override.reason : undefined,
              managerPin: pending.canOverride ? override.pin || undefined : undefined,
            }),
          });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (out.canOverride || out.requiresPin) {
          setPending({ ...pending, error: out.error, canOverride: true });
          return;
        }
        toastError("Not changed", out.error ?? "Try again.");
        return;
      }
      toastSuccess("Booking changed", out.email?.status === "failed" ? `${b.code}. The change email could not be sent.` : b.code);
      setPending(null);
      setSelected(null);
      setOverride({ reason: "", pin: "" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  /* ---------- dragging ---------- */
  const rowAt = (x: number, y: number): string | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const key = (el as HTMLElement).dataset?.rowKey;
      if (key) return key;
    }
    return null;
  };

  const startDrag = (e: React.PointerEvent, b: CalendarBooking, mode: Drag["mode"]) => {
    if (e.button !== 0 || b.status === "checked_out") return;
    if (b.status === "checked_in" && mode !== "end") return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const d: Drag = { booking: b, mode, startX: e.clientX, origArr: idx(b.arrivalDay), origDep: idx(b.departureDay), origRow: rowOf(b), shift: 0, row: rowOf(b), moved: false };
    dragRef.current = d;
    setDrag(d);
  };

  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const shift = Math.round(dx / DAY_W);
    const row = d.mode === "move" ? (rowAt(e.clientX, e.clientY) ?? d.row) : d.row;
    const validRow = row.startsWith("unassigned:") ? row === unassignedKey(d.booking.roomTypeCode) || false : true;
    const next = { ...d, shift, row: validRow ? row : d.row, moved: d.moved || Math.abs(dx) > 4 || (validRow && row !== d.origRow) };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved || (d.shift === 0 && d.row === d.origRow)) {
      setSelected(d.booking);
      return;
    }
    const b = d.booking;
    let arr = d.origArr;
    let dep = d.origDep;
    if (d.mode === "move") {
      arr += d.shift;
      dep += d.shift;
    } else if (d.mode === "start") {
      arr = Math.min(arr + d.shift, dep - 1);
    } else {
      dep = Math.max(dep + d.shift, arr + 1);
    }
    const proposal: Proposal = {
      id: b.id,
      arrivalDay: addDays(days[0], arr),
      departureDay: addDays(days[0], dep),
      ...(d.row !== d.origRow ? { roomUnitId: d.row.startsWith("unassigned:") ? null : d.row } : {}),
    };
    void review(b, proposal);
  };

  /* ---------- picking empty days to make a booking ---------- */
  const rangeStart = (e: React.PointerEvent, row: string, typeId: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-bar]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(N - 1, Math.floor((e.clientX - rect.left) / DAY_W)));
    const r = { row, a: i, b: i };
    rangeRef.current = r;
    setRange(r);
    (e.currentTarget as HTMLElement).dataset.type = typeId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const rangeMove = (e: React.PointerEvent) => {
    if (!rangeRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(N - 1, Math.floor((e.clientX - rect.left) / DAY_W)));
    const r = { ...rangeRef.current, b: i };
    rangeRef.current = r;
    setRange(r);
  };
  const rangeEnd = (e: React.PointerEvent) => {
    const r = rangeRef.current;
    rangeRef.current = null;
    setRange(null);
    if (!r) return;
    const typeId = (e.currentTarget as HTMLElement).dataset.type ?? "";
    const from = Math.min(r.a, r.b);
    const to = Math.max(r.a, r.b) + 1;
    const q = new URLSearchParams({ arrival: addDays(days[0], from), departure: addDays(days[0], to), type: typeId });
    if (!r.row.startsWith("unassigned:")) q.set("room", r.row);
    router.push(`/hms/${slug}/reservations/new?${q.toString()}`);
  };

  /* ---------- drawing ---------- */
  const barFor = (b: CalendarBooking, opts: { ghost?: { arr: number; dep: number } } = {}) => {
    const arr = opts.ghost ? opts.ghost.arr : idx(b.arrivalDay);
    const dep = opts.ghost ? opts.ghost.dep : idx(b.departureDay);
    const left = Math.max(0, (arr + 0.5) * DAY_W);
    const right = Math.min(N * DAY_W, (dep + 0.5) * DAY_W);
    if (right <= 0 || left >= N * DAY_W || right <= left) return null;
    const clippedStart = arr < 0;
    const clippedEnd = dep > N - 1;
    const editable = b.status === "confirmed";
    const dragging = drag?.booking.id === b.id;
    return (
      <div
        key={`${b.id}${opts.ghost ? "-ghost" : ""}`}
        data-bar
        className={`absolute top-1 flex items-center rounded-md border text-xs font-medium shadow-sm ${barClasses(b)} ${opts.ghost ? "pointer-events-none z-20 opacity-80 ring-2 ring-blue-600" : "z-10"} ${dragging && !opts.ghost ? "opacity-30" : ""}`}
        style={{ left, width: right - left, height: ROW_H - 8 }}
      >
        {editable && !clippedStart && !opts.ghost ? (
          <span
            aria-hidden
            className="h-full w-2 shrink-0 cursor-ew-resize rounded-l-md bg-black/10 hover:bg-black/25"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => startDrag(e, b, "start")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          />
        ) : null}
        <button
          type="button"
          disabled={Boolean(opts.ghost)}
          className={`flex h-full min-w-0 flex-1 items-center gap-1 px-1.5 text-left ${editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${focusRing}`}
          style={{ touchAction: "pan-x pan-y" }}
          aria-label={`${b.guestName}, ${b.code}, ${formatDayShort(b.arrivalDay)} to ${formatDayShort(b.departureDay)}. Open to change`}
          title={`${b.guestName} · ${b.code}${b.groupName ? ` · ${b.groupName}` : ""}${b.allotmentName ? ` · ${b.allotmentName}` : ""}`}
          onPointerDown={(e) => startDrag(e, b, "move")}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSelected(b);
            }
          }}
        >
          {b.vip ? <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-600" aria-hidden /> : null}
          <span className="truncate">{b.guestName}</span>
          {b.partySize > 1 ? <span className="shrink-0 opacity-70">×{b.partySize}</span> : null}
        </button>
        {(editable || b.status === "checked_in") && !clippedEnd && !opts.ghost ? (
          <span
            aria-hidden
            className="h-full w-2 shrink-0 cursor-ew-resize rounded-r-md bg-black/10 hover:bg-black/25"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => startDrag(e, b, "end")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          />
        ) : null}
      </div>
    );
  };

  const ghostFor = (rowKey: string) => {
    if (!drag || drag.row !== rowKey || !drag.moved) return null;
    let arr = drag.origArr;
    let dep = drag.origDep;
    if (drag.mode === "move") {
      arr += drag.shift;
      dep += drag.shift;
    } else if (drag.mode === "start") arr = Math.min(arr + drag.shift, dep - 1);
    else dep = Math.max(dep + drag.shift, arr + 1);
    return barFor(drag.booking, { ghost: { arr, dep } });
  };

  const dayHeader = (
    <div className="flex" style={{ width: LABEL_W + N * DAY_W }}>
      <div className="sticky left-0 z-30 shrink-0 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700" style={{ width: LABEL_W }}>
        Room
      </div>
      {days.map((d) => {
        const dt = new Date(`${d}T12:00:00Z`);
        const weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
        return (
          <div
            key={d}
            className={`shrink-0 border-b border-r border-slate-200 py-1.5 text-center text-xs ${d === today ? "bg-sky-100 font-semibold text-sky-900" : weekend ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-700"}`}
            style={{ width: DAY_W }}
          >
            <div>{dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</div>
            <div className="font-semibold tabular-nums">{dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</div>
          </div>
        );
      })}
    </div>
  );

  const gridBackground = {
    backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${DAY_W - 1}px, rgb(226 232 240) ${DAY_W - 1}px, rgb(226 232 240) ${DAY_W}px)`,
  };
  const todayCol = idx(today);

  const renderRow = (rowKey: string, label: React.ReactNode, typeId: string, bookings: CalendarBooking[], extra?: React.ReactNode) => (
    <div key={rowKey} className="flex" style={{ width: LABEL_W + N * DAY_W }}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center border-b border-r border-slate-200 bg-white px-2 text-xs text-slate-800" style={{ width: LABEL_W, height: ROW_H }}>
        {label}
      </div>
      <div
        data-row-key={rowKey}
        className="relative shrink-0 cursor-crosshair border-b border-slate-200"
        style={{ width: N * DAY_W, height: ROW_H, ...gridBackground }}
        onPointerDown={(e) => rangeStart(e, rowKey, typeId)}
        onPointerMove={rangeMove}
        onPointerUp={rangeEnd}
      >
        {todayCol >= 0 && todayCol < N ? <div aria-hidden className="pointer-events-none absolute inset-y-0 bg-sky-50/70" style={{ left: todayCol * DAY_W, width: DAY_W }} /> : null}
        {extra}
        {range && range.row === rowKey ? (
          <div aria-hidden className="pointer-events-none absolute inset-y-1 rounded-md border-2 border-dashed border-blue-600 bg-blue-100/60" style={{ left: Math.min(range.a, range.b) * DAY_W, width: (Math.abs(range.b - range.a) + 1) * DAY_W }} />
        ) : null}
        {bookings.map((b) => barFor(b))}
        {ghostFor(rowKey)}
      </div>
    </div>
  );

  const startDay = days[0];
  const go = (offset: number) => router.push(`/hms/${slug}/reservations/calendar?start=${addDays(startDay, offset)}&days=${N}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <button type="button" className={hmsButton.small} onClick={() => go(-Math.max(7, Math.floor(N / 2)))} aria-label="Earlier">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={hmsButton.small} onClick={() => router.push(`/hms/${slug}/reservations/calendar?days=${N}`)}>
            Today
          </button>
          <button type="button" className={hmsButton.small} onClick={() => go(Math.max(7, Math.floor(N / 2)))} aria-label="Later">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div>
          <label htmlFor={`${ids}-from`} className="mb-1 block text-xs font-medium text-slate-700">
            Start on
          </label>
          <input id={`${ids}-from`} type="date" className={`${hmsInput} w-40`} value={startDay} onChange={(e) => e.target.value && router.push(`/hms/${slug}/reservations/calendar?start=${e.target.value}&days=${N}`)} />
        </div>
        <div>
          <label htmlFor={`${ids}-days`} className="mb-1 block text-xs font-medium text-slate-700">
            Days shown
          </label>
          <select id={`${ids}-days`} className={`${hmsInput} w-28`} value={N} onChange={(e) => router.push(`/hms/${slug}/reservations/calendar?start=${startDay}&days=${e.target.value}`)}>
            {[7, 14, 21, 31].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </div>
        <Link href={`/hms/${slug}/reservations/new`} className={`${hmsButton.primary} ml-auto`}>
          <Plus className="h-4 w-4" aria-hidden />
          New reservation
        </Link>
      </div>

      <ul className="flex flex-wrap gap-3 text-xs text-slate-700" aria-label="Colours">
        <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-sky-400 bg-sky-100" />Coming</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-emerald-400 bg-emerald-100" />In the house</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-amber-400 bg-amber-100" />No room yet</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-slate-300 bg-slate-100" />Left</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-[repeating-linear-gradient(45deg,#fca5a5,#fca5a5_3px,#fee2e2_3px,#fee2e2_6px)]" />Room blocked</li>
      </ul>
      <p className="text-sm text-slate-600">
        Drag a booking to move it, drag its ends to change the nights, or drop it on another room. Drag across empty days to start a booking. Select a booking for a form that does the same with the keyboard or on a phone.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" role="region" aria-label="Booking calendar" tabIndex={0}>
        <div style={{ width: LABEL_W + N * DAY_W }}>
          <div className="sticky top-0 z-30">{dayHeader}</div>
          {data.groups.length === 0 ? <p className="p-4 text-sm text-slate-600">Set up your rooms first.</p> : null}
          {data.groups.map((g) => {
            const un = data.bookings.filter((b) => b.status === "confirmed" && !b.roomUnitId && b.roomTypeCode === g.typeId);
            return (
              <section key={g.typeId} aria-label={g.typeName}>
                <div className="flex" style={{ width: LABEL_W + N * DAY_W }}>
                  <div className="sticky left-0 z-20 shrink-0 border-b border-r border-slate-200 bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-900" style={{ width: LABEL_W }}>
                    {g.typeName}
                  </div>
                  <div className="flex shrink-0 border-b border-slate-200 bg-slate-100">
                    {days.map((d) => {
                      const n = g.counts.find((c) => c.night === d);
                      const f = n ? freeOnNight(n) : null;
                      const tone = !f ? "text-slate-400" : f.free < 0 ? "bg-red-100 text-red-800" : f.free === 0 ? "bg-amber-100 text-amber-900" : "text-slate-700";
                      return (
                        <div key={d} className={`border-r border-slate-200 py-1.5 text-center text-xs font-semibold tabular-nums ${tone}`} style={{ width: DAY_W }} title={f ? `${f.free} of ${n!.stock} rooms free${n!.held ? `, ${n!.held} held for groups` : ""}` : ""}>
                          {f ? f.free : ""}
                          <span className="sr-only"> rooms free on {formatDayLong(d)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {renderRow(unassignedKey(g.typeId), <span className="font-medium text-amber-900">No room yet ({un.length})</span>, g.typeId, un)}
                {g.rooms.map((r) => {
                  const here = data.bookings.filter((b) => b.roomUnitId === r.id);
                  const blocks = data.blocks.filter((b) => b.roomUnitId === r.id);
                  return renderRow(
                    r.id,
                    <span className="truncate">
                      <span className="font-semibold">{r.code}</span> <span className="text-slate-500">floor {r.floor}</span>
                    </span>,
                    g.typeId,
                    here,
                    blocks.map((b, i) => {
                      const a = Math.max(0, idx(b.startDay));
                      const e = b.endDay ? Math.min(N, idx(b.endDay)) : N;
                      return (
                        <div
                          key={i}
                          title={`Blocked: ${b.reason}`}
                          className="pointer-events-none absolute inset-y-0 bg-[repeating-linear-gradient(45deg,#fca5a5,#fca5a5_3px,#fee2e2_3px,#fee2e2_6px)] opacity-70"
                          style={{ left: a * DAY_W, width: Math.max(0, e - a) * DAY_W }}
                        />
                      );
                    }),
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>

      {selected ? (
        <BookingPanel
          key={selected.id}
          slug={slug}
          booking={selected}
          data={data}
          busy={busy}
          onClose={() => setSelected(null)}
          onReview={(p) => {
            void review(selected, p);
          }}
        />
      ) : null}

      {pending ? (
        <div role="dialog" aria-modal="false" aria-label="Confirm the change" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-slate-300 bg-white p-4 shadow-xl">
          <p className="font-semibold text-slate-900">
            {data.bookings.find((b) => b.id === pending.proposal.id)?.guestName}: confirm this change?
          </p>
          {pending.error ? <p role="alert" className="mt-1 text-sm text-red-700">{pending.error}</p> : null}
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {pending.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {pending.note ? <p className="mt-1 text-sm text-slate-700">{pending.note}</p> : null}
          {pending.canOverride ? (
            <div className="mt-3 grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm sm:grid-cols-2">
              <p className="font-medium text-slate-900 sm:col-span-2">A manager can override the limit</p>
              <input aria-label="Reason for overriding" className={hmsInput} placeholder="Reason" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} />
              <input aria-label="Manager's PIN (not needed for owners and admins)" type="password" inputMode="numeric" autoComplete="off" className={hmsInput} placeholder="Manager's PIN" value={override.pin} onChange={(e) => setOverride({ ...override, pin: e.target.value })} />
            </div>
          ) : null}
          {!pending.inHouse && pending.proposal.arrivalDay !== data.bookings.find((b) => b.id === pending.proposal.id)?.arrivalDay ? (
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Email the guest about the change
            </label>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={hmsButton.secondary} onClick={() => setPending(null)} disabled={busy}>
              Leave it as it was
            </button>
            <button type="button" className={hmsButton.primary} onClick={() => void apply()} disabled={busy || (pending.canOverride && !override.reason.trim())}>
              {busy ? "Saving…" : pending.canOverride ? "Override and change" : "Confirm"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The same changes as dragging, as a form: for the keyboard, screen readers and phones. */
function BookingPanel({
  slug,
  booking: b,
  data,
  busy,
  onClose,
  onReview,
}: {
  slug: string;
  booking: CalendarBooking;
  data: CalendarPayload;
  busy: boolean;
  onClose: () => void;
  onReview: (p: Proposal) => void;
}) {
  const ids = useId();
  const [arrival, setArrival] = useState(b.arrivalDay);
  const [departure, setDeparture] = useState(b.departureDay);
  const [room, setRoom] = useState(b.roomUnitId ?? "");
  const editable = b.status === "confirmed";
  const inHouse = b.status === "checked_in";
  const changed = arrival !== b.arrivalDay || departure !== b.departureDay || (room || null) !== b.roomUnitId;

  return (
    <section aria-label={`Booking ${b.code}`} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {b.guestName} <span className="font-normal text-slate-600">· {b.code}</span>
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <HmsPill tone={b.status === "checked_in" ? "green" : b.status === "confirmed" ? "blue" : "slate"}>{b.status === "checked_in" ? "In the house" : b.status === "confirmed" ? "Coming" : "Left"}</HmsPill>
            {b.nights} night{b.nights === 1 ? "" : "s"} · {b.partySize} guest{b.partySize === 1 ? "" : "s"}
            {b.groupName ? ` · Group: ${b.groupName}` : ""}
            {b.allotmentName ? ` · Allotment: ${b.allotmentName}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/hms/${slug}/reservations/${b.id}`} className={hmsButton.small}>
            Open booking
          </Link>
          <button type="button" className={hmsButton.small} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {editable || inHouse ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {editable ? (
            <div>
              <label htmlFor={`${ids}-a`} className="mb-1 block text-sm font-medium text-slate-800">
                Arrival
              </label>
              <input id={`${ids}-a`} type="date" className={hmsInput} value={arrival} onChange={(e) => setArrival(e.target.value)} />
            </div>
          ) : null}
          <div>
            <label htmlFor={`${ids}-d`} className="mb-1 block text-sm font-medium text-slate-800">
              Departure
            </label>
            <input id={`${ids}-d`} type="date" className={hmsInput} value={departure} onChange={(e) => setDeparture(e.target.value)} />
          </div>
          {editable ? (
            <div className="sm:col-span-2">
              <label htmlFor={`${ids}-r`} className="mb-1 block text-sm font-medium text-slate-800">
                Room
              </label>
              <select id={`${ids}-r`} className={hmsInput} value={room} onChange={(e) => setRoom(e.target.value)}>
                <option value="">Not in a room yet</option>
                {data.groups.map((g) => (
                  <optgroup key={g.typeId} label={g.typeName}>
                    {g.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.code}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">This guest has left, so the booking can&apos;t be changed.</p>
      )}
      {inHouse ? <p className="mt-2 text-sm text-slate-600">This guest is in the house: you can change the departure here. To move them to another room, use the front desk.</p> : null}
      {editable || inHouse ? (
        <div className="mt-3">
          <button
            type="button"
            className={hmsButton.primary}
            disabled={busy || !changed || departure <= arrival}
            onClick={() => onReview({ id: b.id, arrivalDay: arrival, departureDay: departure, ...(editable && (room || null) !== b.roomUnitId ? { roomUnitId: room || null } : {}) })}
          >
            Review the change
          </button>
        </div>
      ) : null}
    </section>
  );
}
