"use client";

import { useId, useMemo, useState } from "react";
import { CalendarRange, Pencil, Trash2 } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { useRateBook } from "@/components/hms/revenue/useRateBook";
import { addDays, priceStay } from "@/lib/hms/rates/pricing";
import { DAY_NAMES, type PriceRule, type RateBook } from "@/lib/hms/rates/types";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

const ORDER = [1, 2, 3, 4, 5, 6, 0];

type Draft = { id?: string; roomTypeCode: string; dateFrom: string; dateTo: string; days: number[]; price: string; priority: string; label: string };

export function describeDays(days: number[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return "every day";
  const set = [...days].sort();
  if (set.join() === "0,5,6") return "Fri, Sat and Sun";
  if (set.join() === "5,6") return "Fri and Sat";
  return ORDER.filter((d) => set.includes(d)).map((d) => DAY_NAMES[d]).join(", ");
}

export function formatDayRange(from: string, to: string) {
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return from === to ? f(from) : `${f(from)} to ${f(to)}`;
}

export function PricesClient({ slug }: { slug: string }) {
  const { book, canManage, failed, change } = useRateBook(slug);
  const [planId, setPlanId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = useId();

  const plan = useMemo(() => {
    if (!book) return null;
    return book.plans.find((p) => p.id === planId) ?? book.plans.find((p) => p.isDefault) ?? book.plans[0] ?? null;
  }, [book, planId]);

  if (failed) return <p role="alert" className="text-sm text-red-700">The prices couldn&apos;t be loaded. Refresh the page to try again.</p>;
  if (!book) return <p role="status" className="text-sm text-slate-600">Loading…</p>;
  if (!plan) return <HmsEmptyState art="page" meaning="money" title="No rate plans yet" description="Open Rate plans first; the default plan is created for you there." />;

  const today = new Date().toISOString().slice(0, 10);
  const rules = book.prices.filter((r) => r.ratePlanId === plan.id).sort((a, b) => a.dateFrom.localeCompare(b.dateFrom) || b.priority - a.priority);
  const typeName = (code: string | null) => (code ? book.roomTypes.find((t) => t.id === code)?.name ?? code : "All room types");

  const edit = (r?: PriceRule) =>
    setDraft(
      r
        ? { id: r.id, roomTypeCode: r.roomTypeCode ?? "", dateFrom: r.dateFrom, dateTo: r.dateTo, days: r.daysOfWeek ?? [], price: String(r.price), priority: String(r.priority), label: r.label ?? "" }
        : { roomTypeCode: "", dateFrom: today, dateTo: addDays(today, 30), days: [], price: "", priority: "0", label: "" },
    );

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const ok = await change(
      {
        action: "price",
        price: {
          id: draft.id,
          ratePlanId: plan.id,
          roomTypeCode: draft.roomTypeCode || null,
          dateFrom: draft.dateFrom,
          dateTo: draft.dateTo,
          daysOfWeek: draft.days.length > 0 ? draft.days : null,
          price: Number(draft.price),
          priority: Number(draft.priority) || 0,
          label: draft.label || null,
        },
      },
      "The price is saved.",
    );
    setBusy(false);
    if (ok) setDraft(null);
  };

  return (
    <div className="space-y-5">
      <HmsCard
        id="price-rules"
        icon={CalendarRange}
        meaning="money"
        title="Prices by date and day"
        description="Set a price for a season, a weekend, a holiday. For each night the most specific rule wins: a higher priority first, then a named room type, then the shorter date range, then named days. Nights with no rule use the price in Settings."
        actions={
          <>
            <label htmlFor={`${uid}-plan`} className="sr-only">
              Rate plan
            </label>
            <select id={`${uid}-plan`} className={`${hmsInput} w-auto`} value={plan.id} onChange={(e) => setPlanId(e.target.value)}>
              {book.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {canManage ? (
              <button type="button" className={hmsButton.primary} onClick={() => edit()}>
                Add a price
              </button>
            ) : null}
          </>
        }
      >
        {plan.parentPlanId ? (
          <p className="mb-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {plan.name} follows another plan, so it takes that plan&apos;s prices and adds its own difference. A price you set here for a night replaces that for the night.
          </p>
        ) : null}
        {rules.length === 0 ? (
          <p className="text-sm text-slate-600">No price rules for {plan.name}. Every night uses the room prices in Settings{plan.parentPlanId ? ", with the difference added" : ""}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Dates</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Days</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Room type</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Price per night</th>
                  <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <tr key={r.id} className={r.dateTo < today ? "text-slate-500" : ""}>
                    <td className="py-2.5 pr-3">
                      {formatDayRange(r.dateFrom, r.dateTo)}
                      {r.label ? <span className="ml-2"><HmsPill tone="blue">{r.label}</HmsPill></span> : null}
                      {r.source === "suggestion" ? <span className="ml-2"><HmsPill tone="green">From a suggestion</HmsPill></span> : null}
                    </td>
                    <td className="py-2.5 pr-3">{describeDays(r.daysOfWeek)}</td>
                    <td className="py-2.5 pr-3">{typeName(r.roomTypeCode)}</td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums">
                      {formatPricingAmount(r.price, book.currency)}
                      {r.priority > 0 ? <span className="ml-1 text-xs font-normal text-slate-600">(priority {r.priority})</span> : null}
                    </td>
                    <td className="py-2.5 text-right">
                      {canManage ? (
                        <span className="inline-flex gap-1">
                          <button type="button" className={hmsButton.small} onClick={() => edit(r)} aria-label={`Edit the price for ${formatDayRange(r.dateFrom, r.dateTo)}`}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={hmsButton.small}
                            aria-label={`Delete the price for ${formatDayRange(r.dateFrom, r.dateTo)}`}
                            onClick={() => {
                              if (window.confirm("Delete this price? Nights it covered go back to the next rule or the Settings price.")) void change({ action: "delete_price", id: r.id }, "The price is deleted.");
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

      {draft ? (
        <HmsCard id="price-form" title={draft.id ? "Edit price" : `Add a price for ${plan.name}`} meaning="money">
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Labelled id={`${uid}-label`} label="Name" hint="For you: High season, Christmas, Weekend">
              <input id={`${uid}-label`} className={hmsInput} value={draft.label} maxLength={60} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </Labelled>
            <Labelled id={`${uid}-type`} label="Room type">
              <select id={`${uid}-type`} className={hmsInput} value={draft.roomTypeCode} onChange={(e) => setDraft({ ...draft, roomTypeCode: e.target.value })}>
                <option value="">All room types</option>
                {book.roomTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Settings: {formatPricingAmount(t.baseRate, book.currency)})
                  </option>
                ))}
              </select>
            </Labelled>
            <Labelled id={`${uid}-from`} label="First night">
              <input id={`${uid}-from`} type="date" required className={hmsInput} value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} />
            </Labelled>
            <Labelled id={`${uid}-to`} label="Last night">
              <input id={`${uid}-to`} type="date" required className={hmsInput} value={draft.dateTo} min={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
            </Labelled>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium text-slate-800">Nights of the week</legend>
              <div className="flex flex-wrap items-center gap-2">
                {ORDER.map((d) => {
                  const on = draft.days.includes(d);
                  return (
                    <label key={d} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${on ? "border-xyvoo-blue-deep bg-blue-50 font-medium text-slate-900" : "border-slate-300 text-slate-700"}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() => setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d] })}
                      />
                      {DAY_NAMES[d]}
                    </label>
                  );
                })}
                <button type="button" className={hmsButton.quiet} onClick={() => setDraft({ ...draft, days: [5, 6] })}>
                  Fri and Sat
                </button>
                <button type="button" className={hmsButton.quiet} onClick={() => setDraft({ ...draft, days: [] })}>
                  Every night
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-600">The night is the day the guest sleeps there: a Friday night is the one from Friday to Saturday.</p>
            </fieldset>
            <Labelled id={`${uid}-price`} label={`Price per night (${book.currency})`} hint="Before tax and extra-person charges.">
              <input id={`${uid}-price`} type="number" min={0} step="any" inputMode="decimal" required className={hmsInput} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            </Labelled>
            <Labelled id={`${uid}-prio`} label="Priority" hint="0 is normal. Give an event or holiday a higher number to win over weekends and seasons.">
              <input id={`${uid}-prio`} type="number" min={0} max={100} className={hmsInput} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} />
            </Labelled>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" className={hmsButton.primary} disabled={busy || draft.price === ""}>
                {busy ? "Saving…" : "Save price"}
              </button>
              <button type="button" className={hmsButton.secondary} onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        </HmsCard>
      ) : null}

      <TryAPrice book={book} defaultPlanId={plan.id} />
    </div>
  );
}

/** Price any stay with the same function the booking screens use, so a rule can be checked before guests see it. */
export function TryAPrice({ book, defaultPlanId }: { book: RateBook; defaultPlanId: string }) {
  const uid = useId();
  const today = new Date().toISOString().slice(0, 10);
  const [typeId, setTypeId] = useState(book.roomTypes[0]?.id ?? "");
  const [planId, setPlanId] = useState(defaultPlanId);
  const [arrival, setArrival] = useState(addDays(today, 7));
  const [departure, setDeparture] = useState(addDays(today, 10));
  const [adults, setAdults] = useState("2");

  const result = typeId ? priceStay(book, { roomTypeCode: typeId, plan: planId, arrivalDay: arrival, departureDay: departure, adults: Number(adults) || 1, bookedOn: today }) : null;

  return (
    <HmsCard id="try-a-price" title="Check a price" description="What a guest would be charged for a stay, night by night, using the rules above." meaning="money">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <div>
          <label htmlFor={`${uid}-t`} className="mb-1 block text-sm font-medium text-slate-800">Room type</label>
          <select id={`${uid}-t`} className={hmsInput} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {book.roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-p`} className="mb-1 block text-sm font-medium text-slate-800">Plan</label>
          <select id={`${uid}-p`} className={hmsInput} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {book.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-a`} className="mb-1 block text-sm font-medium text-slate-800">Arrive</label>
          <input id={`${uid}-a`} type="date" className={hmsInput} value={arrival} onChange={(e) => setArrival(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${uid}-d`} className="mb-1 block text-sm font-medium text-slate-800">Leave</label>
          <input id={`${uid}-d`} type="date" className={hmsInput} value={departure} onChange={(e) => setDeparture(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${uid}-n`} className="mb-1 block text-sm font-medium text-slate-800">Adults</label>
          <input id={`${uid}-n`} type="number" min={1} max={20} className={hmsInput} value={adults} onChange={(e) => setAdults(e.target.value)} />
        </div>
      </div>
      <div className="mt-4" aria-live="polite">
        {!result ? null : !result.ok ? (
          <p className="text-sm text-red-700">{result.error}</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 text-sm">
              {result.nights.map((n) => (
                <li key={n.date} className="flex justify-between gap-3 py-1.5">
                  <span>
                    {new Date(`${n.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                    {n.label ? <span className="ml-2 text-slate-600">{n.label}</span> : n.source === "base_rate" ? <span className="ml-2 text-slate-500">Settings price</span> : null}
                  </span>
                  <span className="tabular-nums">{formatPricingAmount(n.total, book.currency)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
              <span>Room total ({result.nights.length} night{result.nights.length === 1 ? "" : "s"})</span>
              <span className="tabular-nums">{formatPricingAmount(result.roomTotal, book.currency)}</span>
            </p>
            {result.issues.map((i) => (
              <p key={i.kind + (i.date ?? "")} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{i.message}</p>
            ))}
          </>
        )}
      </div>
    </HmsCard>
  );
}

function Labelled({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}
