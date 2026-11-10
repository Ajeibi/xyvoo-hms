"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, Palmtree, Scale } from "lucide-react";
import { HmsAlert, HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callHr, checkboxClass } from "@/components/hms/hr/hr-ui";
import { formatDay, type LeaveRequest, type LeaveType } from "@/lib/hms/hr/hr-shared";
import type { LeaveBalance } from "@/lib/hms/hr/hr-leave";

const shiftMonth = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

export function LeaveClient(p: {
  slug: string;
  month: string;
  year: number;
  today: string;
  types: LeaveType[];
  pending: LeaveRequest[];
  clashes: Record<string, number>;
  calendar: { date: string; away: { name: string; type: string; pending: boolean }[] }[];
  upcoming: LeaveRequest[];
  employees: { id: string; name: string }[];
  balances: Record<string, LeaveBalance[]>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [book, setBook] = useState({ employeeId: "", leaveTypeId: "", startDate: "", endDate: "", days: "", reason: "", approveNow: true, allowOverBalance: false });
  const [adj, setAdj] = useState({ employeeId: "", leaveTypeId: "", days: "", reason: "" });
  const active = p.types.filter((t) => t.active);
  const balanceTypes = p.types.filter((t) => t.countsAgainstBalance && t.active);

  async function send(body: Record<string, unknown>, done: (d: Record<string, unknown> | null) => string) {
    setBusy(true);
    setError("");
    setMessage("");
    const { error: err, data } = await callHr<Record<string, unknown>>("/api/hotel/hr/leave", "POST", { slug: p.slug, ...body });
    setBusy(false);
    if (err) {
      setError(err);
      return false;
    }
    setMessage(done(data));
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-4">
      <HmsAlert message={error} />
      {message ? (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      <HmsCard flush title="Waiting for a decision" icon={Inbox} meaning="team">
        {p.pending.length === 0 ? (
          <HmsEmptyState bare icon={Inbox} meaning="team" title="Nothing to decide" description="Requests from the clock screen appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {p.pending.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm sm:px-6">
                <span className="text-slate-800">
                  <strong className="text-slate-900">{l.employeeName}</strong> · {l.leaveTypeName} · {formatDay(l.startDate)} to {formatDay(l.endDate)} ({l.days} days)
                  {l.reason ? <span className="text-slate-500"> · “{l.reason}”</span> : null}
                  {p.clashes[l.id] ? (
                    <>
                      {" "}
                      <HmsPill tone="amber">
                        {p.clashes[l.id]} shift{p.clashes[l.id] === 1 ? "" : "s"} on the rota then
                      </HmsPill>
                    </>
                  ) : null}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={hmsButton.small}
                    disabled={busy}
                    onClick={() => void send({ action: "decide", id: l.id, approve: true, releaseShifts: true }, (d) => `Approved.${d?.released ? ` ${d.released} ${d.released === 1 ? "shift is" : "shifts are"} now open on the rota.` : ""}`)}
                  >
                    Approve
                  </button>
                  <button type="button" className={hmsButton.danger} disabled={busy} onClick={() => void send({ action: "decide", id: l.id, approve: false }, () => "Declined.")}>
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </HmsCard>

      <HmsCard
        title="Who is away"
        icon={CalendarDays}
        meaning="team"
        actions={
          <span className="flex items-center gap-1">
            <Link href={`/hms/${p.slug}/hr/leave?month=${shiftMonth(p.month, -1)}`} className={hmsButton.small} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
            <span className="min-w-[7rem] text-center text-sm font-semibold">{new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
            <Link href={`/hms/${p.slug}/hr/leave?month=${shiftMonth(p.month, 1)}`} className={hmsButton.small} aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </span>
        }
      >
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {p.calendar
            .filter((d) => d.away.length)
            .map((d) => (
              <li key={d.date} className={`rounded-lg border p-2 text-xs ${d.date === p.today ? "border-violet-300" : "border-slate-200"}`}>
                <p className="font-semibold text-slate-900">{formatDay(d.date)}</p>
                {d.away.map((a, i) => (
                  <p key={i} className="text-slate-700">
                    {a.name} · {a.type}
                    {a.pending ? " (asked)" : ""}
                  </p>
                ))}
              </li>
            ))}
        </ul>
        {p.calendar.every((d) => !d.away.length) ? <p className="text-sm text-slate-600">Nobody is away this month.</p> : null}
      </HmsCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <HmsCard title="Book leave for someone" icon={Palmtree} meaning="team" description="Days are counted Monday to Friday. Enter the number yourself for staff who work weekends, or to leave out public holidays.">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await send(
                { action: "create", ...book, endDate: book.endDate || book.startDate, days: book.days ? Number(book.days) : null, reason: book.reason || null },
                (d) => (d?.warning ? `Saved. ${d.warning}` : book.approveNow ? "Leave booked." : "Request saved."),
              );
              if (ok) setBook((b) => ({ ...b, startDate: "", endDate: "", days: "", reason: "" }));
            }}
          >
            <HmsField id="lb-who" label="Who">
              <select id="lb-who" required className={hmsInput} value={book.employeeId} onChange={(e) => setBook({ ...book, employeeId: e.target.value })}>
                <option value="">Choose…</option>
                {p.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </HmsField>
            <HmsField id="lb-type" label="Type">
              <select id="lb-type" required className={hmsInput} value={book.leaveTypeId} onChange={(e) => setBook({ ...book, leaveTypeId: e.target.value })}>
                <option value="">Choose…</option>
                {active.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </HmsField>
            <HmsField id="lb-from" label="First day">
              <input id="lb-from" type="date" required className={hmsInput} value={book.startDate} onChange={(e) => setBook({ ...book, startDate: e.target.value })} />
            </HmsField>
            <HmsField id="lb-to" label="Last day">
              <input id="lb-to" type="date" className={hmsInput} value={book.endDate} min={book.startDate} onChange={(e) => setBook({ ...book, endDate: e.target.value })} />
            </HmsField>
            <HmsField id="lb-days" label="Days" hint="Leave empty to count Monday to Friday." optional>
              <input id="lb-days" type="number" min={0.5} step={0.5} className={hmsInput} value={book.days} onChange={(e) => setBook({ ...book, days: e.target.value })} />
            </HmsField>
            <HmsField id="lb-why" label="Note" optional>
              <input id="lb-why" className={hmsInput} value={book.reason} onChange={(e) => setBook({ ...book, reason: e.target.value })} />
            </HmsField>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className={checkboxClass} checked={book.approveNow} onChange={(e) => setBook({ ...book, approveNow: e.target.checked })} /> Approve it now
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className={checkboxClass} checked={book.allowOverBalance} onChange={(e) => setBook({ ...book, allowOverBalance: e.target.checked })} /> Allow it even if it goes over their balance
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={hmsButton.primary} disabled={busy}>
                Save leave
              </button>
            </div>
          </form>
        </HmsCard>

        <HmsCard title="Adjust a balance" icon={Scale} meaning="team" description="Add days (for example, time off in lieu) or take days away. Every change needs a reason.">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await send({ action: "adjust", ...adj, year: p.year, days: Number(adj.days) }, () => "Balance adjusted.")) setAdj({ employeeId: "", leaveTypeId: "", days: "", reason: "" });
            }}
          >
            <HmsField id="la-who" label="Who">
              <select id="la-who" required className={hmsInput} value={adj.employeeId} onChange={(e) => setAdj({ ...adj, employeeId: e.target.value })}>
                <option value="">Choose…</option>
                {p.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </HmsField>
            <HmsField id="la-type" label="Type">
              <select id="la-type" required className={hmsInput} value={adj.leaveTypeId} onChange={(e) => setAdj({ ...adj, leaveTypeId: e.target.value })}>
                <option value="">Choose…</option>
                {balanceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </HmsField>
            <HmsField id="la-days" label={`Days in ${p.year} (minus to take away)`}>
              <input id="la-days" type="number" step={0.5} required className={hmsInput} value={adj.days} onChange={(e) => setAdj({ ...adj, days: e.target.value })} />
            </HmsField>
            <HmsField id="la-why" label="Reason">
              <input id="la-why" required minLength={3} className={hmsInput} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
            </HmsField>
            <div className="sm:col-span-2">
              <button type="submit" className={hmsButton.secondary} disabled={busy}>
                Adjust
              </button>
            </div>
          </form>
        </HmsCard>
      </div>

      <HmsCard flush title={`Balances for ${p.year}`} description="Days left, after approved and asked-for leave. Includes carry-over and adjustments." icon={Scale} meaning="team">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 sm:px-6">Person</th>
                {balanceTypes.map((t) => (
                  <th key={t.id} className="px-3 py-2 text-right">
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {p.employees.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 font-medium text-slate-900 sm:px-6">{e.name}</td>
                  {balanceTypes.map((t) => {
                    const b = p.balances[e.id]?.find((x) => x.leaveTypeId === t.id);
                    return (
                      <td key={t.id} className={`px-3 py-2 text-right tabular-nums ${b && b.remaining < 0 ? "text-red-700" : "text-slate-800"}`} title={b ? `${b.entitlement} + ${b.carriedOver} carried + ${b.adjustments} adjusted − ${b.used} used − ${b.pending} asked` : undefined}>
                        {b ? b.remaining : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HmsCard>

      {p.upcoming.length ? (
        <HmsCard title="Approved this month">
          <ul className="space-y-1 text-sm">
            {p.upcoming.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {l.employeeName} · {l.leaveTypeName} · {formatDay(l.startDate)} to {formatDay(l.endDate)}
                </span>
                <button type="button" className={hmsButton.quiet} disabled={busy} onClick={() => void send({ action: "cancel", id: l.id }, () => "Leave cancelled.")}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </HmsCard>
      ) : null}
    </div>
  );
}
