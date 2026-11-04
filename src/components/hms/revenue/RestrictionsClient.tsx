"use client";

import { useId, useState } from "react";
import { Ban, Pencil, Trash2 } from "lucide-react";
import { HmsCard, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { describeDays, formatDayRange } from "@/components/hms/revenue/PricesClient";
import { useRateBook } from "@/components/hms/revenue/useRateBook";
import { addDays } from "@/lib/hms/rates/pricing";
import { DAY_NAMES, type Restriction } from "@/lib/hms/rates/types";

const ORDER = [1, 2, 3, 4, 5, 6, 0];

type Draft = {
  id?: string;
  ratePlanId: string;
  roomTypeCode: string;
  dateFrom: string;
  dateTo: string;
  days: number[];
  minStay: string;
  maxStay: string;
  closed: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  minAdvanceDays: string;
  maxAdvanceDays: string;
  note: string;
};

function summary(r: Restriction): string[] {
  const out: string[] = [];
  if (r.closed) out.push("Closed to sales");
  if (r.closedToArrival) out.push("No arrivals");
  if (r.closedToDeparture) out.push("No departures");
  if (r.minStay) out.push(`Min ${r.minStay} night${r.minStay === 1 ? "" : "s"}`);
  if (r.maxStay) out.push(`Max ${r.maxStay} night${r.maxStay === 1 ? "" : "s"}`);
  if (r.minAdvanceDays != null) out.push(`Book ${r.minAdvanceDays}+ days ahead`);
  if (r.maxAdvanceDays != null) out.push(`Book at most ${r.maxAdvanceDays} days ahead`);
  return out;
}

export function RestrictionsClient({ slug }: { slug: string }) {
  const { book, canManage, failed, change } = useRateBook(slug);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = useId();

  if (failed) return <p role="alert" className="text-sm text-red-700">The restrictions couldn&apos;t be loaded. Refresh the page to try again.</p>;
  if (!book) return <p role="status" className="text-sm text-slate-600">Loading…</p>;

  const today = new Date().toISOString().slice(0, 10);
  const rows = [...book.restrictions].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  const planName = (id: string | null) => (id ? book.plans.find((p) => p.id === id)?.name ?? "A plan" : "All plans");
  const typeName = (code: string | null) => (code ? book.roomTypes.find((t) => t.id === code)?.name ?? code : "All room types");

  const edit = (r?: Restriction) =>
    setDraft(
      r
        ? {
            id: r.id,
            ratePlanId: r.ratePlanId ?? "",
            roomTypeCode: r.roomTypeCode ?? "",
            dateFrom: r.dateFrom,
            dateTo: r.dateTo,
            days: r.daysOfWeek ?? [],
            minStay: r.minStay != null ? String(r.minStay) : "",
            maxStay: r.maxStay != null ? String(r.maxStay) : "",
            closed: r.closed,
            closedToArrival: r.closedToArrival,
            closedToDeparture: r.closedToDeparture,
            minAdvanceDays: r.minAdvanceDays != null ? String(r.minAdvanceDays) : "",
            maxAdvanceDays: r.maxAdvanceDays != null ? String(r.maxAdvanceDays) : "",
            note: r.note ?? "",
          }
        : { ratePlanId: "", roomTypeCode: "", dateFrom: today, dateTo: addDays(today, 7), days: [], minStay: "", maxStay: "", closed: false, closedToArrival: false, closedToDeparture: false, minAdvanceDays: "", maxAdvanceDays: "", note: "" },
    );

  const asNumber = (s: string) => (s.trim() === "" ? null : Number(s));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const ok = await change(
      {
        action: "restriction",
        restriction: {
          id: draft.id,
          ratePlanId: draft.ratePlanId || null,
          roomTypeCode: draft.roomTypeCode || null,
          dateFrom: draft.dateFrom,
          dateTo: draft.dateTo,
          daysOfWeek: draft.days.length > 0 ? draft.days : null,
          minStay: asNumber(draft.minStay),
          maxStay: asNumber(draft.maxStay),
          closed: draft.closed,
          closedToArrival: draft.closedToArrival,
          closedToDeparture: draft.closedToDeparture,
          minAdvanceDays: asNumber(draft.minAdvanceDays),
          maxAdvanceDays: asNumber(draft.maxAdvanceDays),
          note: draft.note || null,
        },
      },
      "The restriction is saved.",
    );
    setBusy(false);
    if (ok) setDraft(null);
  };

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <div className="space-y-5">
      <HmsCard
        id="restrictions"
        icon={Ban}
        meaning="money"
        title="Restrictions"
        description="Rules about who can book which nights: a minimum stay over Christmas, no arrivals on a day, a night closed to sales. Where several rules cover a night, the strictest one applies."
        actions={
          canManage ? (
            <button type="button" className={hmsButton.primary} onClick={() => edit()}>
              Add a restriction
            </button>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-slate-600">No restrictions. Any stay of any length can start or end on any day.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${r.dateTo < today ? "text-slate-500" : ""}`}>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {formatDayRange(r.dateFrom, r.dateTo)} <span className="font-normal text-slate-600">· {describeDays(r.daysOfWeek)}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    {planName(r.ratePlanId)} · {typeName(r.roomTypeCode)}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {summary(r).map((s) => (
                      <HmsPill key={s} tone={s.startsWith("Closed") || s.startsWith("No ") ? "red" : "amber"}>
                        {s}
                      </HmsPill>
                    ))}
                  </p>
                </div>
                {canManage ? (
                  <span className="inline-flex gap-1">
                    <button type="button" className={hmsButton.small} onClick={() => edit(r)} aria-label={`Edit the restriction for ${formatDayRange(r.dateFrom, r.dateTo)}`}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={hmsButton.small}
                      aria-label={`Delete the restriction for ${formatDayRange(r.dateFrom, r.dateTo)}`}
                      onClick={() => {
                        if (window.confirm("Delete this restriction?")) void change({ action: "delete_restriction", id: r.id }, "The restriction is deleted.");
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!canManage ? <p className="mt-3 text-xs text-slate-600">Only an owner or admin can change restrictions.</p> : null}
      </HmsCard>

      {draft ? (
        <HmsCard id="restriction-form" title={draft.id ? "Edit restriction" : "Add a restriction"} meaning="money">
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <L id={`${uid}-plan`} label="Plan">
              <select id={`${uid}-plan`} className={hmsInput} value={draft.ratePlanId} onChange={(e) => patch({ ratePlanId: e.target.value })}>
                <option value="">All plans</option>
                {book.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </L>
            <L id={`${uid}-type`} label="Room type">
              <select id={`${uid}-type`} className={hmsInput} value={draft.roomTypeCode} onChange={(e) => patch({ roomTypeCode: e.target.value })}>
                <option value="">All room types</option>
                {book.roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </L>
            <L id={`${uid}-from`} label="From">
              <input id={`${uid}-from`} type="date" required className={hmsInput} value={draft.dateFrom} onChange={(e) => patch({ dateFrom: e.target.value })} />
            </L>
            <L id={`${uid}-to`} label="To">
              <input id={`${uid}-to`} type="date" required className={hmsInput} min={draft.dateFrom} value={draft.dateTo} onChange={(e) => patch({ dateTo: e.target.value })} />
            </L>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium text-slate-800">Only on these days</legend>
              <div className="flex flex-wrap gap-2">
                {ORDER.map((d) => {
                  const on = draft.days.includes(d);
                  return (
                    <label key={d} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${on ? "border-xyvoo-blue-deep bg-blue-50 font-medium text-slate-900" : "border-slate-300 text-slate-700"}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => patch({ days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d] })} />
                      {DAY_NAMES[d]}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-slate-600">Leave empty for every day. Arrival and stay-length rules follow the day the guest arrives; &quot;no departures&quot; follows the day they leave; &quot;closed&quot; follows each night.</p>
            </fieldset>
            <L id={`${uid}-min`} label="Minimum stay (nights)" optional>
              <input id={`${uid}-min`} type="number" min={1} max={365} className={hmsInput} value={draft.minStay} onChange={(e) => patch({ minStay: e.target.value })} />
            </L>
            <L id={`${uid}-max`} label="Maximum stay (nights)" optional>
              <input id={`${uid}-max`} type="number" min={1} max={365} className={hmsInput} value={draft.maxStay} onChange={(e) => patch({ maxStay: e.target.value })} />
            </L>
            <L id={`${uid}-minadv`} label="Book at least this many days ahead" optional>
              <input id={`${uid}-minadv`} type="number" min={0} max={730} className={hmsInput} value={draft.minAdvanceDays} onChange={(e) => patch({ minAdvanceDays: e.target.value })} />
            </L>
            <L id={`${uid}-maxadv`} label="Book at most this many days ahead" optional>
              <input id={`${uid}-maxadv`} type="number" min={0} max={730} className={hmsInput} value={draft.maxAdvanceDays} onChange={(e) => patch({ maxAdvanceDays: e.target.value })} />
            </L>
            <fieldset className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-medium text-slate-800">Closing</legend>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.closed} onChange={(e) => patch({ closed: e.target.checked })} /> Closed to sales (stop sell): no stay can include these nights</label>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.closedToArrival} onChange={(e) => patch({ closedToArrival: e.target.checked })} /> No arrivals: a stay can&apos;t start on these days</label>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.closedToDeparture} onChange={(e) => patch({ closedToDeparture: e.target.checked })} /> No departures: a stay can&apos;t end on these days</label>
            </fieldset>
            <L id={`${uid}-note`} label="Note for staff" optional>
              <input id={`${uid}-note`} className={hmsInput} maxLength={200} value={draft.note} onChange={(e) => patch({ note: e.target.value })} />
            </L>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" className={hmsButton.primary} disabled={busy}>{busy ? "Saving…" : "Save restriction"}</button>
              <button type="button" className={hmsButton.secondary} onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </form>
        </HmsCard>
      ) : null}
    </div>
  );
}

function L({ id, label, optional, children }: { id: string; label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label} {optional ? <span className="font-normal text-slate-500">(optional)</span> : null}
      </label>
      {children}
    </div>
  );
}
