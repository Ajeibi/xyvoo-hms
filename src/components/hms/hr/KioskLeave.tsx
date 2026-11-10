"use client";

import { useState } from "react";
import { Palmtree } from "lucide-react";
import type { KioskLeaveExtras, KioskState } from "@/lib/hms/hr/hr-kiosk";
import type { KioskCall } from "@/components/hms/hr/KioskClient";
import { LEAVE_STATUS_LABEL, formatDay } from "@/lib/hms/hr/hr-shared";

const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

/** Leave requests and balances on the clock screen. */
export function KioskLeave({ state, call, busy }: { state: KioskState; call: KioskCall; busy: boolean }) {
  const leave = state.extras.leave as KioskLeaveExtras | undefined;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ leaveTypeId: "", startDate: "", endDate: "", note: "" });
  if (!leave) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <Palmtree className="h-4 w-4" aria-hidden /> Leave
      </h2>
      {leave.balances.length ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {leave.balances.map((b) => (
            <li key={b.name} className="flex justify-between gap-2">
              <span className="text-slate-700">{b.name}</span>
              <span className="font-semibold tabular-nums text-slate-900">{b.remaining} days</span>
            </li>
          ))}
        </ul>
      ) : null}
      {leave.requests.length ? (
        <ul className="space-y-1 text-sm">
          {leave.requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {r.type}: {formatDay(r.startDate)} to {formatDay(r.endDate)} ({r.days} days) · {LEAVE_STATUS_LABEL[r.status]}
              </span>
              <button type="button" className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm" disabled={busy} onClick={() => void call("leave_cancel", { leaveId: r.id })}>
                Cancel
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!open ? (
        <button type="button" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800" onClick={() => setOpen(true)}>
          Ask for leave
        </button>
      ) : (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("leave_request", { leaveTypeId: f.leaveTypeId, startDate: f.startDate, endDate: f.endDate || f.startDate, note: f.note || null })) {
              setOpen(false);
              setF({ leaveTypeId: "", startDate: "", endDate: "", note: "" });
            }
          }}
        >
          <label htmlFor="kl-type" className="block text-sm font-medium text-slate-800">
            Type
          </label>
          <select id="kl-type" required className={field} value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })}>
            <option value="">Choose…</option>
            {leave.types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="kl-from" className="block text-sm font-medium text-slate-800">
                First day
              </label>
              <input id="kl-from" type="date" required className={field} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
            </div>
            <div>
              <label htmlFor="kl-to" className="block text-sm font-medium text-slate-800">
                Last day
              </label>
              <input id="kl-to" type="date" className={field} value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
            </div>
          </div>
          <label htmlFor="kl-note" className="block text-sm font-medium text-slate-800">
            Note (optional)
          </label>
          <input id="kl-note" className={field} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <div className="flex gap-2">
            <button type="submit" className="rounded-xl bg-xyvoo-blue-deep px-4 py-2.5 font-semibold text-white disabled:opacity-50" disabled={busy}>
              Send
            </button>
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2.5" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
