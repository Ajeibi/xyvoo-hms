"use client";

import { useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { useRateBook } from "@/components/hms/revenue/useRateBook";
import { addDays } from "@/lib/hms/rates/pricing";
import type { RateFeed } from "@/lib/hms/rates/feed";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

type Sel = { roomTypeCode: string; from: string; to: string };
type Action = "price" | "stop" | "min_stay" | "no_arrivals" | "no_departures";

function short(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}
function month(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function RatesCalendarClient({ slug }: { slug: string }) {
  const { book, canManage, failed, change } = useRateBook(slug);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [days, setDays] = useState(14);
  const [planId, setPlanId] = useState("");
  const [feed, setFeed] = useState<RateFeed | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<Sel | null>(null);

  const plan = book?.plans.find((p) => p.id === planId) ?? book?.plans.find((p) => p.isDefault) ?? book?.plans[0];

  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    const q = new URLSearchParams({ slug, from, days: String(days) });
    if (plan) q.set("plan", plan.id);
    fetch(`/api/hotel/rates/grid?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: RateFeed) => {
        if (!cancelled) {
          setFeed(d);
          setError("");
        }
      })
      .catch(() => !cancelled && setError("The calendar couldn't be loaded. Refresh the page to try again."));
    return () => {
      cancelled = true;
    };
  }, [book, slug, from, days, plan, version]);

  if (failed || error) return <p role="alert" className="text-sm text-red-700">{error || "The calendar couldn't be loaded. Refresh the page to try again."}</p>;
  if (!book || !feed || !plan) return <p role="status" className="text-sm text-slate-600">Loading…</p>;

  const dates = Array.from({ length: feed.days }, (_, i) => addDays(feed.fromDay, i));
  const pick = (roomTypeCode: string, date: string) => {
    if (!canManage) return;
    setSel((s) => {
      if (s && s.roomTypeCode === roomTypeCode && s.from === s.to && date > s.from) return { ...s, to: date };
      return { roomTypeCode, from: date, to: date };
    });
  };
  const inSel = (roomTypeCode: string, date: string) => Boolean(sel && sel.roomTypeCode === roomTypeCode && date >= sel.from && date <= sel.to);

  return (
    <div className="space-y-5">
      <HmsCard
        id="rates-calendar"
        title="Rates calendar"
        meaning="money"
        description="The price, the restrictions and the rooms left for every night. Tap a night to change it; tap a later night in the same row to change a range."
        actions={
          <>
            <label className="sr-only" htmlFor="cal-plan">Rate plan</label>
            <select id="cal-plan" className={`${hmsInput} w-auto`} value={plan.id} onChange={(e) => setPlanId(e.target.value)}>
              {book.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label className="sr-only" htmlFor="cal-days">Days shown</label>
            <select id="cal-days" className={`${hmsInput} w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
            <button type="button" className={hmsButton.small} onClick={() => setFrom(addDays(from, -days))} aria-label="Earlier days"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
            <button type="button" className={hmsButton.small} onClick={() => setFrom(today)}>Today</button>
            <button type="button" className={hmsButton.small} onClick={() => setFrom(addDays(from, days))} aria-label="Later days"><ChevronRight className="h-4 w-4" aria-hidden /></button>
          </>
        }
      >
        <p className="mb-2 text-sm text-slate-600">{month(dates[0])}{month(dates[dates.length - 1]) !== month(dates[0]) ? ` to ${month(dates[dates.length - 1])}` : ""} · {plan.name}</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table data-no-stack className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-700">
                <th scope="col" className="sticky left-0 z-10 min-w-36 bg-slate-50 px-3 py-2 text-left font-medium">Room type</th>
                {dates.map((d) => (
                  <th key={d} scope="col" className={`min-w-20 px-1 py-2 text-center font-medium ${[0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) ? "bg-slate-100" : ""}`}>{short(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feed.rows.map((row) => (
                <tr key={row.roomTypeCode} className="border-t border-slate-200">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left align-top font-medium text-slate-900">{row.roomTypeName}</th>
                  {row.cells.map((c) => {
                    const left = feed.free[row.roomTypeCode]?.[c.date] ?? 0;
                    const selected = inSel(row.roomTypeCode, c.date);
                    return (
                      <td key={c.date} className={`p-0 align-top ${c.closed ? "bg-red-50" : left === 0 ? "bg-amber-50" : ""}`}>
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => pick(row.roomTypeCode, c.date)}
                          aria-pressed={selected}
                          aria-label={`${row.roomTypeName}, ${short(c.date)}: ${formatPricingAmount(c.price, feed.currency)}, ${left} left${c.closed ? ", closed" : ""}${c.minStay ? `, minimum ${c.minStay} nights` : ""}${c.closedToArrival ? ", no arrivals" : ""}${c.closedToDeparture ? ", no departures" : ""}`}
                          className={`block w-full px-1 py-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${selected ? "bg-blue-100 ring-2 ring-inset ring-blue-500" : "hover:bg-slate-50"}`}
                        >
                          <span className="block font-semibold tabular-nums text-slate-900">{formatPricingAmount(c.price, feed.currency)}</span>
                          <span className={`block tabular-nums ${left === 0 ? "text-amber-800" : "text-slate-600"}`}>{left} left</span>
                          <span className="block min-h-4 text-[11px] leading-4 text-red-800">
                            {c.closed ? "Closed" : ""}
                            {c.closedToArrival ? " CTA" : ""}
                            {c.closedToDeparture ? " CTD" : ""}
                            {c.minStay ? ` ${c.minStay}n min` : ""}
                          </span>
                          {c.label ? <span className="block truncate text-[11px] text-blue-800">{c.label}</span> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-600">CTA: no arrivals. CTD: no departures. &quot;n min&quot;: minimum nights. The price is for one night for two adults, before tax.</p>
        {!canManage ? <p className="mt-1 text-xs text-slate-600">Only an owner or admin can change rates.</p> : null}
      </HmsCard>

      {sel && canManage ? (
        <QuickChange
          key={`${sel.roomTypeCode}${sel.from}${sel.to}`}
          sel={sel}
          setSel={setSel}
          roomTypeName={book.roomTypes.find((t) => t.id === sel.roomTypeCode)?.name ?? ""}
          currency={book.currency}
          planName={plan.name}
          onApply={async (action, value, scope) => {
            const common = { dateFrom: sel.from, dateTo: sel.to, roomTypeCode: sel.roomTypeCode };
            const ok =
              action === "price"
                ? await change({ action: "price", price: { ratePlanId: plan.id, ...common, price: value, priority: 10, label: "Calendar change" } }, "The price is changed.")
                : await change(
                    {
                      action: "restriction",
                      restriction: {
                        ratePlanId: scope === "plan" ? plan.id : null,
                        ...common,
                        closed: action === "stop",
                        closedToArrival: action === "no_arrivals",
                        closedToDeparture: action === "no_departures",
                        minStay: action === "min_stay" ? value : null,
                        note: "Calendar change",
                      },
                    },
                    "The restriction is saved.",
                  );
            if (ok) {
              setSel(null);
              setVersion((v) => v + 1);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function QuickChange({
  sel,
  setSel,
  roomTypeName,
  currency,
  planName,
  onApply,
}: {
  sel: Sel;
  setSel: (s: Sel | null) => void;
  roomTypeName: string;
  currency: string;
  planName: string;
  onApply: (action: Action, value: number, scope: "plan" | "all") => Promise<void>;
}) {
  const uid = useId();
  const [action, setAction] = useState<Action>("price");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<"plan" | "all">("all");
  const [busy, setBusy] = useState(false);
  const needsValue = action === "price" || action === "min_stay";

  return (
    <HmsCard id="quick-change" title={`Change ${roomTypeName}, ${short(sel.from)}${sel.to !== sel.from ? ` to ${short(sel.to)}` : ""}`} meaning="money">
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onApply(action, Number(value), scope);
          setBusy(false);
        }}
      >
        <div>
          <label htmlFor={`${uid}-a`} className="mb-1 block text-sm font-medium text-slate-800">What to do</label>
          <select id={`${uid}-a`} className={hmsInput} value={action} onChange={(e) => setAction(e.target.value as Action)}>
            <option value="price">Set the price</option>
            <option value="stop">Stop selling</option>
            <option value="min_stay">Set a minimum stay</option>
            <option value="no_arrivals">No arrivals</option>
            <option value="no_departures">No departures</option>
          </select>
        </div>
        {needsValue ? (
          <div>
            <label htmlFor={`${uid}-v`} className="mb-1 block text-sm font-medium text-slate-800">{action === "price" ? `Price per night (${currency})` : "Nights"}</label>
            <input id={`${uid}-v`} type="number" min={action === "price" ? 0 : 1} step="any" required className={hmsInput} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        ) : null}
        {action !== "price" ? (
          <div>
            <label htmlFor={`${uid}-s`} className="mb-1 block text-sm font-medium text-slate-800">Applies to</label>
            <select id={`${uid}-s`} className={hmsInput} value={scope} onChange={(e) => setScope(e.target.value as "plan" | "all")}>
              <option value="all">Every plan</option>
              <option value="plan">{planName} only</option>
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor={`${uid}-to`} className="mb-1 block text-sm font-medium text-slate-800">Last night</label>
          <input id={`${uid}-to`} type="date" min={sel.from} className={hmsInput} value={sel.to} onChange={(e) => setSel({ ...sel, to: e.target.value || sel.from })} />
        </div>
        <div className="sm:col-span-4 flex gap-2">
          <button type="submit" className={hmsButton.primary} disabled={busy || (needsValue && value === "")}>{busy ? "Saving…" : "Apply"}</button>
          <button type="button" className={hmsButton.secondary} onClick={() => setSel(null)}>Cancel</button>
        </div>
      </form>
    </HmsCard>
  );
}
