"use client";

import { useId, useState } from "react";
import { Layers, Pencil, Plus, Star } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { useRateBook } from "@/components/hms/revenue/useRateBook";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { CHANNELS, CHANNEL_LABELS, type RateBook, type RatePlan } from "@/lib/hms/rates/types";

const BOARDS = ["Room only", "Bed and breakfast", "Half board", "Full board", "All inclusive"];

type Draft = {
  id?: string;
  name: string;
  code: string;
  description: string;
  parentPlanId: string;
  deriveKind: "percent" | "amount";
  deriveValue: string;
  boardBasis: string;
  refundable: boolean;
  prepayRequired: boolean;
  roomTypeCodes: string[];
  channels: string[];
  arCustomerId: string;
  sellFrom: string;
  sellTo: string;
  active: boolean;
  isDefault: boolean;
};

const blank = (parentPlanId = ""): Draft => ({
  name: "",
  code: "",
  description: "",
  parentPlanId,
  deriveKind: "amount",
  deriveValue: "0",
  boardBasis: "Room only",
  refundable: true,
  prepayRequired: false,
  roomTypeCodes: [],
  channels: ["front_desk", "website", "partner"],
  arCustomerId: "",
  sellFrom: "",
  sellTo: "",
  active: true,
  isDefault: false,
});

function toDraft(p: RatePlan): Draft {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description ?? "",
    parentPlanId: p.parentPlanId ?? "",
    deriveKind: p.deriveKind ?? "amount",
    deriveValue: String(p.deriveValue),
    boardBasis: p.boardBasis,
    refundable: p.refundable,
    prepayRequired: p.prepayRequired,
    roomTypeCodes: p.roomTypeCodes ?? [],
    channels: p.channels,
    arCustomerId: p.arCustomerId ?? "",
    sellFrom: p.sellFrom ?? "",
    sellTo: p.sellTo ?? "",
    active: p.active,
    isDefault: p.isDefault,
  };
}

export function describePricing(plan: RatePlan, book: RateBook): string {
  if (!plan.parentPlanId) return plan.isDefault ? "Priced from the price rules, or from Settings where there is none" : "Priced from its own price rules, or Settings where there is none";
  const parent = book.plans.find((p) => p.id === plan.parentPlanId);
  const v = plan.deriveValue;
  const sign = v >= 0 ? "plus" : "minus";
  const amount = plan.deriveKind === "percent" ? `${Math.abs(v)}%` : formatPricingAmount(Math.abs(v), book.currency);
  return `${parent?.name ?? "another plan"} ${sign} ${amount}`;
}

export function RatePlansClient({ slug }: { slug: string }) {
  const { book, companies, canManage, failed, change } = useRateBook(slug);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = useId();

  if (failed) return <p role="alert" className="text-sm text-red-700">The rate plans couldn&apos;t be loaded. Refresh the page to try again.</p>;
  if (!book) return <p role="status" className="text-sm text-slate-600">Loading…</p>;

  const plans = [...book.plans].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const def = plans.find((p) => p.isDefault);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const ok = await change(
      {
        action: "plan",
        plan: {
          id: draft.id,
          name: draft.name,
          code: draft.code,
          description: draft.description || null,
          parentPlanId: draft.parentPlanId || null,
          deriveKind: draft.parentPlanId ? draft.deriveKind : null,
          deriveValue: draft.parentPlanId ? Number(draft.deriveValue) || 0 : 0,
          boardBasis: draft.boardBasis,
          refundable: draft.refundable,
          prepayRequired: draft.prepayRequired,
          roomTypeCodes: draft.roomTypeCodes.length > 0 ? draft.roomTypeCodes : null,
          channels: draft.channels,
          arCustomerId: draft.arCustomerId || null,
          sellFrom: draft.sellFrom || null,
          sellTo: draft.sellTo || null,
          active: draft.active,
          sortOrder: 0,
        },
      },
      "The rate plan is saved.",
    );
    setBusy(false);
    if (ok) setDraft(null);
  };

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  return (
    <div className="space-y-5">
      <HmsCard
        id="rate-plans"
        icon={Layers}
        meaning="money"
        title="Rate plans"
        description="A rate plan is a way of selling a room: room only, bed and breakfast, non-refundable, a company rate. A plan can follow another by a percentage or an amount, so changing the room-only price changes the rest."
        actions={
          canManage ? (
            <>
              <button type="button" className={hmsButton.small} onClick={() => setDraft({ ...blank(def?.id ?? ""), name: "Bed and breakfast", code: "BB", boardBasis: "Bed and breakfast", deriveValue: "15000" })}>
                <Plus className="h-4 w-4" aria-hidden /> Bed and breakfast
              </button>
              <button type="button" className={hmsButton.small} onClick={() => setDraft({ ...blank(def?.id ?? ""), name: "Non-refundable", code: "NR", refundable: false, prepayRequired: true, deriveKind: "percent", deriveValue: "-10" })}>
                <Plus className="h-4 w-4" aria-hidden /> Non-refundable
              </button>
              <button type="button" className={hmsButton.primary} onClick={() => setDraft(blank(""))}>
                <Plus className="h-4 w-4" aria-hidden /> New plan
              </button>
            </>
          ) : null
        }
      >
        {plans.length === 0 ? (
          <HmsEmptyState art="page" meaning="money" title="No rate plans yet" description="An owner or admin opening this page creates the default plan, Room only, priced from your room prices in Settings." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {p.name}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{p.code}</span>
                    {p.isDefault ? <HmsPill tone="blue">Default</HmsPill> : null}
                    {!p.active ? <HmsPill tone="slate">Off</HmsPill> : null}
                    {!p.refundable ? <HmsPill tone="amber">Non-refundable</HmsPill> : null}
                    {p.arCustomerId ? <HmsPill tone="green">Company: {companies.find((c) => c.id === p.arCustomerId)?.name ?? "linked"}</HmsPill> : null}
                  </p>
                  <p className="text-sm text-slate-600">
                    {p.boardBasis} · {describePricing(p, book)}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <button type="button" className={hmsButton.small} onClick={() => setDraft(toDraft(p))} aria-label={`Edit ${p.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden /> Edit
                    </button>
                    {!p.isDefault && !p.parentPlanId && p.active ? (
                      <button type="button" className={hmsButton.quiet} onClick={() => change({ action: "default_plan", id: p.id }, `${p.name} is now the default plan.`)} aria-label={`Make ${p.name} the default plan`}>
                        <Star className="h-4 w-4" aria-hidden /> Make default
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!canManage ? <p className="mt-3 text-xs text-slate-600">Only an owner or admin can change rate plans.</p> : null}
      </HmsCard>

      {draft ? (
        <HmsCard id="rate-plan-form" title={draft.id ? `Edit ${draft.name || "plan"}` : "New rate plan"} meaning="money">
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field id={`${uid}-name`} label="Name">
              <input id={`${uid}-name`} className={hmsInput} value={draft.name} onChange={(e) => patch({ name: e.target.value })} required maxLength={80} />
            </Field>
            <Field id={`${uid}-code`} label="Code" hint="Short and unique, e.g. BB. Used by the booking screens and booking sites.">
              <input id={`${uid}-code`} className={`${hmsInput} uppercase`} value={draft.code} onChange={(e) => patch({ code: e.target.value.toUpperCase() })} required maxLength={24} />
            </Field>
            <Field id={`${uid}-board`} label="Meals included">
              <select id={`${uid}-board`} className={hmsInput} value={draft.boardBasis} onChange={(e) => patch({ boardBasis: e.target.value })}>
                {BOARDS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field id={`${uid}-desc`} label="Note for staff" optional>
              <input id={`${uid}-desc`} className={hmsInput} value={draft.description} onChange={(e) => patch({ description: e.target.value })} maxLength={400} />
            </Field>

            {!draft.isDefault ? (
              <fieldset className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-medium text-slate-800">How it is priced</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field id={`${uid}-parent`} label="Follows">
                    <select id={`${uid}-parent`} className={hmsInput} value={draft.parentPlanId} onChange={(e) => patch({ parentPlanId: e.target.value })}>
                      <option value="">Nothing: its own prices</option>
                      {plans.filter((p) => p.id !== draft.id && !p.parentPlanId).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                      {plans.filter((p) => p.id !== draft.id && p.parentPlanId).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {draft.parentPlanId ? (
                    <>
                      <Field id={`${uid}-kind`} label="Plus or minus">
                        <select id={`${uid}-kind`} className={hmsInput} value={draft.deriveKind} onChange={(e) => patch({ deriveKind: e.target.value as "percent" | "amount" })}>
                          <option value="amount">An amount per night</option>
                          <option value="percent">A percentage</option>
                        </select>
                      </Field>
                      <Field id={`${uid}-value`} label={draft.deriveKind === "percent" ? "Percent (negative takes off)" : `Amount (${book.currency}, negative takes off)`}>
                        <input id={`${uid}-value`} type="number" step="any" inputMode="decimal" className={hmsInput} value={draft.deriveValue} onChange={(e) => patch({ deriveValue: e.target.value })} />
                      </Field>
                    </>
                  ) : null}
                </div>
              </fieldset>
            ) : null}

            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-medium text-slate-800">Conditions</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.refundable} onChange={(e) => patch({ refundable: e.target.checked })} /> Can be cancelled under the hotel&apos;s cancellation rules
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.prepayRequired} onChange={(e) => patch({ prepayRequired: e.target.checked })} /> Guest pays in full when booking
              </label>
              {!draft.isDefault ? (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.active} onChange={(e) => patch({ active: e.target.checked })} /> On sale
                </label>
              ) : null}
            </fieldset>

            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-medium text-slate-800">Where it is sold</legend>
              {CHANNELS.map((c) => (
                <label key={c} className="mt-1 flex items-center gap-2 text-sm first:mt-0">
                  <input type="checkbox" checked={draft.channels.includes(c)} onChange={() => patch({ channels: toggle(draft.channels, c) })} /> {CHANNEL_LABELS[c]}
                </label>
              ))}
            </fieldset>

            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-medium text-slate-800">Room types</legend>
              <p className="mb-1 text-xs text-slate-600">Leave all unticked to sell every room type.</p>
              {book.roomTypes.map((t) => (
                <label key={t.id} className="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.roomTypeCodes.includes(t.id)} onChange={() => patch({ roomTypeCodes: toggle(draft.roomTypeCodes, t.id) })} /> {t.name}
                </label>
              ))}
            </fieldset>

            <div className="space-y-3">
              <Field id={`${uid}-co`} label="Company" optional hint="Makes this a company rate: only bookings for this company can use it.">
                <select id={`${uid}-co`} className={hmsInput} value={draft.arCustomerId} onChange={(e) => patch({ arCustomerId: e.target.value })}>
                  <option value="">Anyone</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id={`${uid}-from`} label="Sold from" optional>
                  <input id={`${uid}-from`} type="date" className={hmsInput} value={draft.sellFrom} onChange={(e) => patch({ sellFrom: e.target.value })} />
                </Field>
                <Field id={`${uid}-to`} label="Sold until" optional>
                  <input id={`${uid}-to`} type="date" className={hmsInput} value={draft.sellTo} onChange={(e) => patch({ sellTo: e.target.value })} />
                </Field>
              </div>
            </div>

            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <button type="submit" className={hmsButton.primary} disabled={busy}>
                {busy ? "Saving…" : "Save plan"}
              </button>
              <button type="button" className={hmsButton.secondary} onClick={() => setDraft(null)}>
                Cancel
              </button>
              {draft.id && !draft.isDefault ? (
                <button
                  type="button"
                  className={`${hmsButton.danger} ml-auto`}
                  onClick={async () => {
                    if (!window.confirm(`Delete ${draft.name}? Bookings already made on it keep their prices; if any exist, switch the plan off instead.`)) return;
                    if (await change({ action: "delete_plan", id: draft.id }, "The plan is deleted.")) setDraft(null);
                  }}
                >
                  Delete plan
                </button>
              ) : null}
            </div>
          </form>
        </HmsCard>
      ) : null}
    </div>
  );
}

function Field({ id, label, hint, optional, children }: { id: string; label: string; hint?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label} {optional ? <span className="font-normal text-slate-500">(optional)</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}
