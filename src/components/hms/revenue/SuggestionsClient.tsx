"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { PriceSuggestion, RevenueSettings } from "@/lib/hms/rates/suggestions";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

type Data = {
  open: PriceSuggestion[];
  decided: PriceSuggestion[];
  settings: RevenueSettings;
  currency: string;
  roomTypes: { id: string; name: string }[];
  canManage: boolean;
};

function day(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function SuggestionsClient({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel/rates/suggestions?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setFailed(true);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, done: string, key: string) => {
    setBusy(key);
    const res = await fetch("/api/hotel/rates/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, ...body }) });
    const out = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      toastError("Not done", out.error ?? "Please try again.");
      return false;
    }
    setData(out);
    toastSuccess("Done", done);
    return out;
  };

  if (failed) return <p role="alert" className="text-sm text-red-700">The suggestions couldn&apos;t be loaded. Refresh the page to try again.</p>;
  if (!data) return <p role="status" className="text-sm text-slate-600">Loading…</p>;

  const typeName = (code: string) => data.roomTypes.find((t) => t.id === code)?.name ?? code;

  return (
    <div className="space-y-5">
      <HmsCard
        id="suggestions"
        icon={Sparkles}
        meaning="money"
        title="Price suggestions"
        description="Where rooms are selling faster or slower than usual for how far away the night is, the system suggests a higher or lower price. Nothing changes until you accept it, and an accepted suggestion becomes a normal price on your Prices page."
        actions={
          data.canManage ? (
            <button
              type="button"
              className={hmsButton.secondary}
              disabled={busy === "refresh" || !data.settings.suggestionsEnabled}
              onClick={async () => {
                const r = await post({ action: "refresh" }, "Suggestions are up to date.", "refresh");
                if (r && r.created === 0) toastSuccess("Up to date", "No new suggestions right now.");
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> {busy === "refresh" ? "Looking…" : "Look again now"}
            </button>
          ) : null
        }
      >
        {!data.settings.suggestionsEnabled ? (
          <p className="text-sm text-slate-600">Suggestions are switched off. Turn them on below.</p>
        ) : data.open.length === 0 ? (
          <HmsEmptyState art="page" meaning="money" title="No suggestions right now" description="Every night is selling about as expected. Suggestions are refreshed every morning, or press Look again now." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.open.map((s) => (
              <SuggestionRow key={s.id} s={s} typeName={typeName(s.roomTypeCode)} currency={data.currency} canManage={data.canManage} busy={busy === s.id} onAccept={(price) => post({ action: "accept", id: s.id, price }, "The price is changed.", s.id)} onDismiss={() => post({ action: "dismiss", id: s.id }, "Dismissed.", s.id)} />
            ))}
          </ul>
        )}
      </HmsCard>

      <SettingsCard data={data} onSave={(settings) => post({ action: "settings", settings }, "The limits are saved.", "settings")} />

      {data.decided.length > 0 ? (
        <HmsCard id="suggestion-history" title="Recently decided" meaning="money">
          <ul className="divide-y divide-slate-100 text-sm">
            {data.decided.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {typeName(s.roomTypeCode)}, {day(s.stayDate)}: {formatPricingAmount(s.currentPrice, data.currency)} to {formatPricingAmount(s.suggestedPrice, data.currency)}
                </span>
                <HmsPill tone={s.status === "accepted" ? "green" : "slate"}>{s.status === "accepted" ? "Accepted" : "Dismissed"}</HmsPill>
              </li>
            ))}
          </ul>
        </HmsCard>
      ) : null}
    </div>
  );
}

function SuggestionRow({ s, typeName, currency, canManage, busy, onAccept, onDismiss }: { s: PriceSuggestion; typeName: string; currency: string; canManage: boolean; busy: boolean; onAccept: (price: number) => Promise<unknown>; onDismiss: () => Promise<unknown> }) {
  const uid = useId();
  const [price, setPrice] = useState(String(s.suggestedPrice));
  const up = s.suggestedPrice > s.currentPrice;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {typeName}, {day(s.stayDate)}{" "}
            <HmsPill tone={up ? "green" : "amber"}>{up ? "Raise" : "Lower"}</HmsPill>
          </p>
          <p className="text-sm text-slate-700">
            {formatPricingAmount(s.currentPrice, currency)} <span aria-hidden>→</span> <span className="sr-only">to</span> <strong>{formatPricingAmount(s.suggestedPrice, currency)}</strong> a night
          </p>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{s.reason}</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={`${uid}-p`} className="mb-1 block text-xs font-medium text-slate-700">Price to set</label>
              <input id={`${uid}-p`} type="number" min={0} step="any" className={`${hmsInput} w-32`} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <button type="button" className={hmsButton.primary} disabled={busy || price === ""} onClick={() => onAccept(Number(price))}>Accept</button>
            <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => onDismiss()}>Dismiss</button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function SettingsCard({ data, onSave }: { data: Data; onSave: (s: RevenueSettings) => Promise<unknown> }) {
  const uid = useId();
  const [s, setS] = useState({ ...data.settings });
  const [busy, setBusy] = useState(false);
  const num = (k: keyof RevenueSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  return (
    <HmsCard id="suggestion-limits" title="Limits" description="How far suggestions are allowed to move a price. Percentages are of the room price in Settings." meaning="money">
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave(s);
          setBusy(false);
        }}
      >
        <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
          <input type="checkbox" checked={s.suggestionsEnabled} disabled={!data.canManage} onChange={(e) => setS({ ...s, suggestionsEnabled: e.target.checked })} /> Make price suggestions
        </label>
        <div>
          <label htmlFor={`${uid}-step`} className="mb-1 block text-sm font-medium text-slate-800">Biggest step (%)</label>
          <input id={`${uid}-step`} type="number" min={1} max={100} className={hmsInput} disabled={!data.canManage} value={s.maxStepPercent} onChange={num("maxStepPercent")} />
        </div>
        <div>
          <label htmlFor={`${uid}-floor`} className="mb-1 block text-sm font-medium text-slate-800">Never below (%)</label>
          <input id={`${uid}-floor`} type="number" min={1} max={100} className={hmsInput} disabled={!data.canManage} value={s.floorPercent} onChange={num("floorPercent")} />
        </div>
        <div>
          <label htmlFor={`${uid}-ceil`} className="mb-1 block text-sm font-medium text-slate-800">Never above (%)</label>
          <input id={`${uid}-ceil`} type="number" min={100} max={1000} className={hmsInput} disabled={!data.canManage} value={s.ceilingPercent} onChange={num("ceilingPercent")} />
        </div>
        <div>
          <label htmlFor={`${uid}-h`} className="mb-1 block text-sm font-medium text-slate-800">Look ahead (days)</label>
          <input id={`${uid}-h`} type="number" min={7} max={180} className={hmsInput} disabled={!data.canManage} value={s.horizonDays} onChange={num("horizonDays")} />
        </div>
        {data.canManage ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" className={hmsButton.primary} disabled={busy}>{busy ? "Saving…" : "Save limits"}</button>
          </div>
        ) : null}
      </form>
    </HmsCard>
  );
}
