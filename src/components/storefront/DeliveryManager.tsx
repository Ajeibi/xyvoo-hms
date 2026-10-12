"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, MapPin, Pencil, Plus, Store, Trash2, Truck } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import type { DeliveryZone } from "@/lib/store/delivery";
import AreaPicker from "./AreaPicker";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashStatus, sendJson } from "./dashboard-ui";

type Draft = { id: string | null; name: string; regions: string[]; fee: string; freeOver: string; etaText: string; isPickup: boolean; isActive: boolean };

const EMPTY: Draft = { id: null, name: "", regions: [], fee: "0", freeOver: "", etaText: "", isPickup: false, isActive: true };

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

function SkeletonRows() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-slate-100 p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
          <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/** Delivery options customers choose from at checkout. */
export default function DeliveryManager({ slug, currency, countryCode = "NG" }: { slug: string; currency: string; countryCode?: string }) {
  const [zones, setZones] = useState<DeliveryZone[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const formKey = draft ? (draft.id ?? "new") : null;

  const load = () =>
    fetch(`/api/store/delivery-zones?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        setZones(data.zones ?? []);
        setCanManage(Boolean(data.canManage));
      })
      .catch(() => setError("We couldn't load your delivery options. Please refresh the page."));

  useEffect(() => {
    void load();
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Take keyboard and screen reader users straight to the form when it opens.
  useEffect(() => {
    if (formKey) nameRef.current?.focus();
  }, [formKey]);

  const startNew = () => {
    setStatus("");
    setDraft(EMPTY);
  };

  const edit = (z: DeliveryZone) => {
    setStatus("");
    setDraft({
      id: z.id,
      name: z.name,
      regions: z.regions,
      fee: String(z.fee),
      freeOver: z.freeOver == null ? "" : String(z.freeOver),
      etaText: z.etaText ?? "",
      isPickup: z.isPickup,
      isActive: z.isActive,
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setError("");
    setBusy(true);
    const body = {
      slug,
      name: draft.name,
      regions: draft.isPickup ? [] : draft.regions,
      fee: draft.fee === "" ? 0 : draft.fee,
      freeOver: draft.freeOver === "" ? null : draft.freeOver,
      etaText: draft.etaText || null,
      isPickup: draft.isPickup,
      isActive: draft.isActive,
    };
    try {
      await sendJson(draft.id ? `/api/store/delivery-zones/${draft.id}` : "/api/store/delivery-zones", draft.id ? "PATCH" : "POST", body);
      setStatus(`“${draft.name}” saved.`);
      setDraft(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (z: DeliveryZone) => {
    if (!window.confirm(`Remove “${z.name}”? Customers won't be able to choose it any more.`)) return;
    setError("");
    try {
      await sendJson(`/api/store/delivery-zones/${z.id}?slug=${encodeURIComponent(slug)}`, "DELETE");
      setStatus(`“${z.name}” removed.`);
      if (draft?.id === z.id) setDraft(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const price = (z: DeliveryZone) =>
    z.isPickup
      ? "Free collection"
      : `${z.fee === 0 ? "Free" : formatShopCurrency(z.fee, currency)}${z.freeOver != null ? `, free on orders over ${formatShopCurrency(z.freeOver, currency)}` : ""}`;

  const shown = zones?.filter((z) => z.isActive).length ?? 0;
  const summary =
    zones === null || zones.length === 0
      ? null
      : shown === 0
        ? "None of your delivery options are switched on, so customers can't choose one at checkout."
        : `Customers can choose from ${shown} delivery ${shown === 1 ? "option" : "options"} at checkout.`;

  return (
    <DashCard
      id="zones"
      icon={Truck}
      title="Delivery options"
      description="How customers can get their order, and what each way costs."
      actions={
        canManage && !draft && zones?.length ? (
          <button type="button" onClick={startNew} className={`${dashButton.primary} ${ring}`}>
            <Plus className="h-4 w-4" aria-hidden /> Add an option
          </button>
        ) : null
      }
    >
      {/* Always in the page so screen readers announce changes to it. */}
      <DashStatus message={status} />
      <div className={`space-y-4 ${status ? "mt-3" : ""}`}>
        <DashAlert message={error} />
        {summary ? <p className={`text-sm ${shown === 0 ? "text-amber-800" : "text-slate-700"}`}>{summary}</p> : null}

        {zones === null ? (
          <>
            <p className="sr-only" role="status">
              Loading your delivery options
            </p>
            <SkeletonRows />
          </>
        ) : zones.length === 0 ? (
          draft ? null : (
            <DashEmptyState
              icon={Truck}
              title="No delivery options yet"
              description="Add the ways you deliver, such as a local courier or collection from your shop. Until you do, customers pay for their items only."
              action={
                canManage ? (
                  <button type="button" onClick={startNew} className={`${dashButton.primary} ${ring}`}>
                    <Plus className="h-4 w-4" aria-hidden /> Add a delivery option
                  </button>
                ) : null
              }
            />
          )
        ) : (
          <ul className="space-y-3">
            {zones.map((z) => (
              <li key={z.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{z.name}</span>
                    {z.isActive ? <DashPill tone="green">Shown at checkout</DashPill> : <DashPill>Hidden</DashPill>}
                  </p>
                  <p className="mt-1 text-base font-medium text-slate-900">{price(z)}</p>
                  <ul className="mt-1 space-y-0.5 text-slate-600">
                    {z.isPickup || z.regions.length ? (
                      <li className="flex items-start gap-1.5">
                        {z.isPickup ? <Store className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                        <span className="min-w-0 break-words">{z.isPickup ? "Collection in person" : z.regions.join(", ")}</span>
                      </li>
                    ) : null}
                    {z.etaText ? (
                      <li className="flex items-start gap-1.5">
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 break-words">{z.etaText}</span>
                      </li>
                    ) : null}
                  </ul>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => edit(z)} className={`${dashButton.quiet} ${ring}`}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit<span className="sr-only"> {z.name}</span>
                    </button>
                    <button type="button" onClick={() => remove(z)} className={`${dashButton.danger} ${ring}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove<span className="sr-only"> {z.name}</span>
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {draft ? (
          <form onSubmit={save} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5" noValidate aria-labelledby="zone-form-title">
            <h3 id="zone-form-title" className="text-base font-semibold text-slate-900">
              {draft.id ? `Edit “${draft.name}”` : "New delivery option"}
            </h3>
            <DashField id="zone-name" label="Name customers see" hint="For example “Lagos delivery” or “Nationwide courier”.">
              <input ref={nameRef} id="zone-name" className={dashInput} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-describedby="zone-name-hint" />
            </DashField>
            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input type="checkbox" checked={draft.isPickup} onChange={(e) => setDraft({ ...draft, isPickup: e.target.checked })} className="mt-0.5 h-4 w-4" />
              This is collection in person (always free, no address needed)
            </label>
            {!draft.isPickup ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <DashField id="zone-fee" label={`Charge per order (${currency})`}>
                  <input id="zone-fee" className={dashInput} type="number" min={0} step="any" inputMode="decimal" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} />
                </DashField>
                <DashField id="zone-free" label={`Free on orders over (${currency})`} optional>
                  <input id="zone-free" className={dashInput} type="number" min={0} step="any" inputMode="decimal" value={draft.freeOver} onChange={(e) => setDraft({ ...draft, freeOver: e.target.value })} />
                </DashField>
              </div>
            ) : null}
            <DashField
              id="zone-eta"
              label={draft.isPickup ? "Collection details" : "Delivery time"}
              optional
              hint={draft.isPickup ? "For example “Ready in 24 hours from our Ikeja shop”." : "For example “1 to 3 working days”."}
            >
              <input id="zone-eta" className={dashInput} value={draft.etaText} onChange={(e) => setDraft({ ...draft, etaText: e.target.value })} aria-describedby="zone-eta-hint" />
            </DashField>
            {!draft.isPickup ? (
              <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                <legend className="px-1 text-sm font-medium text-slate-800">Where it delivers</legend>
                <p className="text-sm text-slate-600">
                  Customers only see this option when their address is in one of these places. Choose nothing to offer it everywhere.
                </p>
                <AreaPicker id="zone-areas" countryCode={countryCode} value={draft.regions} onChange={(regions) => setDraft((d) => (d ? { ...d, regions } : d))} />
              </fieldset>
            ) : null}
            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="mt-0.5 h-4 w-4" />
              Customers can choose this option
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={`${dashButton.primary} ${ring}`}>
                {busy ? "Saving…" : "Save option"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className={`${dashButton.secondary} ${ring}`}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </DashCard>
  );
}
