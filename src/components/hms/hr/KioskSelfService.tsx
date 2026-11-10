"use client";

import { useState } from "react";
import { CalendarPlus, Repeat } from "lucide-react";
import type { KioskState, KioskSwapExtras } from "@/lib/hms/hr/hr-kiosk";
import type { KioskCall } from "@/components/hms/hr/KioskClient";
import { SWAP_STATUS_LABEL, formatDay, isoToLocalTime, type Shift } from "@/lib/hms/hr/hr-shared";
import { KioskLeave } from "@/components/hms/hr/KioskLeave";

const when = (s: Shift | null) => (s ? `${formatDay(s.shiftDate)} ${isoToLocalTime(s.startsAt)}–${isoToLocalTime(s.endsAt)}` : "a shift");
const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
const btn = "rounded-xl bg-xyvoo-blue-deep px-4 py-2.5 font-semibold text-white disabled:opacity-50";
const quiet = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50";

/** Shift swaps, open shifts and leave on the clock screen. */
export function KioskSelfService({ state, call, busy }: { state: KioskState; call: KioskCall; busy: boolean }) {
  const swaps = state.extras.swaps as KioskSwapExtras | undefined;
  return (
    <div className="space-y-4">
      {swaps ? <Swaps swaps={swaps} call={call} busy={busy} /> : null}
      <KioskLeave state={state} call={call} busy={busy} />
    </div>
  );
}

function Swaps({ swaps, call, busy }: { swaps: KioskSwapExtras; call: KioskCall; busy: boolean }) {
  const [mode, setMode] = useState<"" | "offer" | "swap">("");
  const [shiftId, setShiftId] = useState("");
  const [toId, setToId] = useState("");
  const [otherId, setOtherId] = useState("");

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <Repeat className="h-4 w-4" aria-hidden /> Swaps and open shifts
      </h2>

      {swaps.forMe.length ? (
        <div>
          <p className="text-sm font-medium text-slate-800">Asked of you</p>
          <ul className="mt-1 space-y-2 text-sm">
            {swaps.forMe.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-2">
                <span>
                  {r.kind === "swap" ? `${r.fromName} wants your ${when(r.otherShift)} for their ${when(r.shift)}` : `${r.fromName} offers ${when(r.shift)}`}
                </span>
                <span className="flex gap-2">
                  <button type="button" className={btn} disabled={busy} onClick={() => void call("accept", { swapId: r.id })}>
                    Accept
                  </button>
                  {r.toEmployeeId ? (
                    <button type="button" className={quiet} disabled={busy} onClick={() => void call("cancel_swap", { swapId: r.id })}>
                      No thanks
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {swaps.openShifts.length ? (
        <div>
          <p className="text-sm font-medium text-slate-800">Open shifts you can take</p>
          <ul className="mt-1 space-y-2 text-sm">
            {swaps.openShifts.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {when(s)}
                  {s.position ? ` · ${s.position}` : ""}
                </span>
                <button type="button" className={quiet} disabled={busy || swaps.myRequests.some((r) => r.shift?.id === s.id)} onClick={() => void call("pick_up", { shiftId: s.id })}>
                  {swaps.myRequests.some((r) => r.shift?.id === s.id) ? "Asked" : "I'll take it"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {swaps.myRequests.length ? (
        <div>
          <p className="text-sm font-medium text-slate-800">Your requests</p>
          <ul className="mt-1 space-y-1 text-sm">
            {swaps.myRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {when(r.shift)} · {SWAP_STATUS_LABEL[r.status]}
                </span>
                <button type="button" className={quiet} disabled={busy} onClick={() => void call("cancel_swap", { swapId: r.id })}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {swaps.offerable.length ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quiet} aria-pressed={mode === "offer"} onClick={() => setMode(mode === "offer" ? "" : "offer")}>
              Give away a shift
            </button>
            <button type="button" className={quiet} aria-pressed={mode === "swap"} onClick={() => setMode(mode === "swap" ? "" : "swap")}>
              Swap a shift
            </button>
          </div>
          {mode ? (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok =
                  mode === "offer"
                    ? await call("offer", { shiftId, toEmployeeId: toId || null })
                    : await call("swap", { shiftId, otherShiftId: otherId });
                if (ok) {
                  setMode("");
                  setShiftId("");
                  setToId("");
                  setOtherId("");
                }
              }}
            >
              <label className="block text-sm font-medium text-slate-800" htmlFor="k-mine">
                Your shift
              </label>
              <select id="k-mine" required className={field} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                <option value="">Choose…</option>
                {swaps.offerable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              {mode === "offer" ? (
                <>
                  <label className="block text-sm font-medium text-slate-800" htmlFor="k-to">
                    To
                  </label>
                  <select id="k-to" className={field} value={toId} onChange={(e) => setToId(e.target.value)}>
                    <option value="">Anyone in my team</option>
                    {swaps.colleagues.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-slate-800" htmlFor="k-other">
                    For a colleague&apos;s shift
                  </label>
                  <select id="k-other" required className={field} value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                    <option value="">Choose…</option>
                    {swaps.colleagueShifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.employeeName}: {when(s)}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button type="submit" className={btn} disabled={busy}>
                <CalendarPlus className="mr-1 inline h-4 w-4" aria-hidden /> Send request
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
