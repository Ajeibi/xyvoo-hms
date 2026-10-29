"use client";

import { useState } from "react";
import { Clock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  applyChange,
  changeLabel,
  DAY_SHORT,
  FB_TIME_ZONE_CHOICES,
  type FbPriceRule,
  type FbPriceRuleInput,
  ruleIsOn,
  scheduleLabel,
  validatePriceRule,
} from "@/lib/hms/fb-price-rules";
import { useHotelClock } from "@/lib/hms/fb-price-clock";
import type { FbMenuCategoryRow, FbOutletRow } from "@/lib/hms/fb-types";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsAlert, HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { cn } from "@/lib/utils";

const EXAMPLE_PRICE = 2000;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Form = {
  name: string;
  outletId: string;
  categoryIds: string[];
  days: number[];
  startsAt: string;
  endsAt: string;
  kind: "off" | "extra";
  percent: string;
  isActive: boolean;
};

const blankForm = (): Form => ({
  name: "Happy hour",
  outletId: "",
  categoryIds: [],
  days: [1, 2, 3, 4, 5],
  startsAt: "17:00",
  endsAt: "19:00",
  kind: "off",
  percent: "20",
  isActive: true,
});

function formFromRule(rule: FbPriceRule): Form {
  return {
    name: rule.name,
    outletId: rule.outlet_id ?? "",
    categoryIds: rule.category_ids,
    days: rule.days,
    startsAt: rule.starts_at,
    endsAt: rule.ends_at,
    kind: rule.change_percent < 0 ? "off" : "extra",
    percent: String(Math.abs(rule.change_percent)),
    isActive: rule.is_active,
  };
}

function inputFromForm(form: Form): FbPriceRuleInput {
  const pct = Number(form.percent);
  return {
    name: form.name,
    outletId: form.outletId || null,
    categoryIds: form.categoryIds,
    days: form.days,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    changePercent: Number.isFinite(pct) ? (form.kind === "off" ? -pct : pct) : Number.NaN,
    isActive: form.isActive,
  };
}

/** Happy hours and other time-based prices on the restaurant and bar menus. */
export function FbPriceRulesSetup({
  slug,
  currency,
  outlets,
  categories,
  initialRules,
  initialTimeZone,
}: {
  slug: string;
  currency: string;
  outlets: FbOutletRow[];
  categories: FbMenuCategoryRow[];
  initialRules: FbPriceRule[];
  initialTimeZone: string;
}) {
  const [rules, setRules] = useState(initialRules);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const clock = useHotelClock(timeZone);
  const money = (n: number) => formatPricingAmount(n, currency);

  const outletName = (id: string | null) => (id ? (outlets.find((o) => o.id === id)?.name ?? "Removed outlet") : "Every outlet");
  const categoryNames = (ids: string[]) =>
    ids.length ? categories.filter((c) => ids.includes(c.id)).map((c) => c.name).join(", ") : "every item";

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/hotel/fb/price-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  };

  const saveTimeZone = async (zone: string) => {
    const before = timeZone;
    setTimeZone(zone);
    setBusy("tz");
    try {
      const { ok, data } = await post({ action: "timeZone", timeZone: zone });
      if (!ok) {
        setTimeZone(before);
        toastError("Could not save", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Time zone saved", `Price-rule hours now follow ${zone}.`);
    } catch {
      setTimeZone(before);
      toastError("Could not save", "Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const saveRule = async () => {
    if (!editing) return;
    const input = inputFromForm(editing.form);
    const invalid = validatePriceRule(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy("save");
    setError("");
    try {
      const { ok, data } = await post(
        editing.id ? { action: "update", id: editing.id, rule: input } : { action: "create", rule: input },
      );
      if (!ok) {
        setError(data.error ?? "Could not save. Try again.");
        return;
      }
      setRules((prev) => (editing.id ? prev.map((r) => (r.id === editing.id ? data.rule : r)) : [...prev, data.rule]));
      setEditing(null);
      toastSuccess("Price rule saved", "New orders use it. Items already ordered keep their price.");
    } catch {
      toastError("Could not save", "Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const toggleRule = async (rule: FbPriceRule) => {
    const input = { ...inputFromForm(formFromRule(rule)), isActive: !rule.is_active };
    setBusy(rule.id);
    try {
      const { ok, data } = await post({ action: "update", id: rule.id, rule: input });
      if (!ok) {
        toastError("Could not save", data.error ?? "Try again.");
        return;
      }
      setRules((prev) => prev.map((r) => (r.id === rule.id ? data.rule : r)));
    } catch {
      toastError("Could not save", "Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const deleteRule = async (rule: FbPriceRule) => {
    if (!window.confirm(`Delete "${rule.name}"? Items already ordered keep their price.`)) return;
    setBusy(rule.id);
    try {
      const { ok, data } = await post({ action: "delete", id: rule.id });
      if (!ok) {
        toastError("Could not delete", data.error ?? "Try again.");
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      if (editing?.id === rule.id) setEditing(null);
      toastSuccess("Price rule deleted");
    } catch {
      toastError("Could not delete", "Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const form = editing?.form;
  const setForm = (patch: Partial<Form>) =>
    setEditing((prev) => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));
  const formCategories = categories.filter((c) => c.is_active && (!form?.outletId || c.outlet_id === form.outletId));
  const draft = form ? inputFromForm(form) : null;
  const examplePrice =
    draft && Number.isFinite(draft.changePercent) && draft.changePercent !== 0
      ? applyChange(EXAMPLE_PRICE, draft.changePercent)
      : null;

  return (
    <HmsCard
      id="price-rules"
      icon={Clock}
      meaning="food"
      title="Happy hours and time-based prices"
      description="Change menu prices by a percentage on chosen days and hours, such as drinks 20% off on weekdays from 5 to 7pm. The price is fixed when an item is ordered."
      className="mt-6 scroll-mt-24"
    >
      <div className="max-w-xs">
        <HmsField
          id="fb-price-time-zone"
          label="Hotel time zone"
          hint="The hours below are read on this clock, whatever the time on each device."
        >
          <select
            id="fb-price-time-zone"
            value={timeZone}
            disabled={busy === "tz"}
            onChange={(e) => void saveTimeZone(e.target.value)}
            aria-describedby="fb-price-time-zone-hint"
            className={hmsInput}
          >
            {[...new Set([timeZone, ...FB_TIME_ZONE_CHOICES])].map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace("_", " ")}
              </option>
            ))}
          </select>
        </HmsField>
      </div>

      {rules.length ? (
        <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200">
          {rules.map((rule) => {
            const on = clock ? ruleIsOn(rule, clock) : false;
            return (
              <li key={rule.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {rule.name}
                    {!rule.is_active ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Off</span>
                    ) : on ? (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-200">
                        Running now
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-slate-700">
                    {changeLabel(rule.change_percent)} on {categoryNames(rule.category_ids)} · {outletName(rule.outlet_id)}
                  </p>
                  <p className="text-sm text-slate-600">{scheduleLabel(rule)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <label className="mr-2 flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={rule.is_active}
                      disabled={busy === rule.id}
                      onChange={() => void toggleRule(rule)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    On<span className="sr-only"> for {rule.name}</span>
                  </label>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setError("");
                      setEditing({ id: rule.id, form: formFromRule(rule) });
                    }}
                    className={hmsButton.quiet}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                    Edit<span className="sr-only"> {rule.name}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void deleteRule(rule)}
                    className={hmsButton.danger}
                    aria-label={`Delete ${rule.name}`}
                  >
                    {busy === rule.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-600">No price rules yet. Menu prices stay the same all day.</p>
      )}

      {form && editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveRule();
          }}
          className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
          aria-label={editing.id ? `Edit ${form.name}` : "New price rule"}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <HmsField id="fb-price-name" label="Name" hint="Shown on the till and the bill.">
              <input
                id="fb-price-name"
                value={form.name}
                maxLength={60}
                onChange={(e) => setForm({ name: e.target.value })}
                aria-describedby="fb-price-name-hint"
                className={hmsInput}
              />
            </HmsField>
            <HmsField id="fb-price-outlet" label="Where">
              <select
                id="fb-price-outlet"
                value={form.outletId}
                onChange={(e) => {
                  const outletId = e.target.value;
                  // Drop categories that belong to another outlet.
                  setForm({
                    outletId,
                    categoryIds: outletId
                      ? form.categoryIds.filter((id) => categories.find((c) => c.id === id)?.outlet_id === outletId)
                      : form.categoryIds,
                  });
                }}
                className={hmsInput}
              >
                <option value="">Every outlet</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </HmsField>
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-800">Which items</legend>
            <p className="mb-2 text-xs text-slate-600">Leave all unticked for every item{form.outletId ? " in this outlet" : ""}.</p>
            {formCategories.length ? (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {formCategories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(c.id)}
                      onChange={(e) =>
                        setForm({
                          categoryIds: e.target.checked
                            ? [...form.categoryIds, c.id]
                            : form.categoryIds.filter((id) => id !== c.id),
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {c.name}
                    {!form.outletId && outlets.length > 1 ? (
                      <span className="text-xs text-slate-500">({outletName(c.outlet_id)})</span>
                    ) : null}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600">No menu categories here yet.</p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-800">Days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAY_ORDER.map((d) => {
                const on = form.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setForm({ days: on ? form.days.filter((x) => x !== d) : [...form.days, d] })}
                    className={cn(
                      "min-h-9 min-w-12 rounded-lg border px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      on ? "border-violet-600 bg-violet-50 text-violet-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {DAY_SHORT[d]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
            <HmsField id="fb-price-start" label="From">
              <input
                id="fb-price-start"
                type="time"
                value={form.startsAt}
                onChange={(e) => setForm({ startsAt: e.target.value })}
                className={hmsInput}
              />
            </HmsField>
            <HmsField id="fb-price-end" label="Until" hint="Earlier than From = runs past midnight.">
              <input
                id="fb-price-end"
                type="time"
                value={form.endsAt}
                onChange={(e) => setForm({ endsAt: e.target.value })}
                aria-describedby="fb-price-end-hint"
                className={hmsInput}
              />
            </HmsField>
            <HmsField id="fb-price-kind" label="Change">
              <select
                id="fb-price-kind"
                value={form.kind}
                onChange={(e) => setForm({ kind: e.target.value as Form["kind"] })}
                className={hmsInput}
              >
                <option value="off">Discount</option>
                <option value="extra">Increase</option>
              </select>
            </HmsField>
            <HmsField id="fb-price-percent" label="By">
              <div className="relative">
                <input
                  id="fb-price-percent"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  max={form.kind === "off" ? 90 : 100}
                  step="0.01"
                  value={form.percent}
                  onChange={(e) => setForm({ percent: e.target.value })}
                  className={cn(hmsInput, "pr-8")}
                />
                <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  %
                </span>
              </div>
            </HmsField>
          </div>

          {examplePrice !== null ? (
            <p className="text-sm text-slate-700" aria-live="polite">
              Example: an item at {money(EXAMPLE_PRICE)} sells for <span className="font-semibold">{money(examplePrice)}</span>
              {draft && draft.days.length ? ` · ${scheduleLabel({ days: draft.days, starts_at: draft.startsAt, ends_at: draft.endsAt })}` : ""}
            </p>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ isActive: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            Switched on
          </label>

          <HmsAlert message={error} />

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy === "save"} className={hmsButton.primary}>
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {editing.id ? "Save changes" : "Add price rule"}
            </button>
            <button type="button" disabled={busy === "save"} onClick={() => setEditing(null)} className={hmsButton.secondary}>
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-600">
            When two rules run at once, the guest gets the lower price. Items already ordered keep the price they were ordered at.
          </p>
        </form>
      ) : (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setError("");
            setEditing({ id: null, form: blankForm() });
          }}
          className={cn(hmsButton.secondary, "mt-4")}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add a price rule
        </button>
      )}
    </HmsCard>
  );
}
