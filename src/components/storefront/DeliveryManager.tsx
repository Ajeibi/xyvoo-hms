"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Truck } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import type { DeliveryZone } from "@/lib/store/delivery";
import { DashAlert, DashField, dashInput, DashStatus, sendJson } from "./dashboard-ui";

type Draft = { id: string | null; name: string; regions: string; fee: string; freeOver: string; etaText: string; isPickup: boolean; isActive: boolean };

const EMPTY: Draft = { id: null, name: "", regions: "", fee: "0", freeOver: "", etaText: "", isPickup: false, isActive: true };

/** Delivery options customers choose from at checkout. */
export default function DeliveryManager({ slug, currency }: { slug: string; currency: string }) {
  const [zones, setZones] = useState<DeliveryZone[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

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

  const edit = (z: DeliveryZone) =>
    setDraft({
      id: z.id,
      name: z.name,
      regions: z.regions.join(", "),
      fee: String(z.fee),
      freeOver: z.freeOver == null ? "" : String(z.freeOver),
      etaText: z.etaText ?? "",
      isPickup: z.isPickup,
      isActive: z.isActive,
    });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setError("");
    setBusy(true);
    const body = {
      slug,
      name: draft.name,
      regions: draft.regions.split(",").map((r) => r.trim()).filter(Boolean),
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
    if (!window.confirm(`Delete “${z.name}”? Customers won't be able to choose it any more.`)) return;
    setError("");
    try {
      await sendJson(`/api/store/delivery-zones/${z.id}?slug=${encodeURIComponent(slug)}`, "DELETE");
      setStatus(`“${z.name}” deleted.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const price = (z: DeliveryZone) =>
    z.isPickup
      ? "Free collection"
      : `${z.fee === 0 ? "Free" : formatShopCurrency(z.fee, currency)}${z.freeOver != null ? `, free over ${formatShopCurrency(z.freeOver, currency)}` : ""}`;

  return (
    <div className="space-y-6">
      <DashAlert message={error} />
      <DashStatus message={status} />

      <section aria-labelledby="zones-title" className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="zones-title" className="text-base font-semibold text-slate-900">
            Delivery options
          </h2>
          {canManage && !draft ? (
            <button type="button" onClick={() => setDraft(EMPTY)} className="inline-flex items-center gap-2 rounded-xl bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" aria-hidden /> Add an option
            </button>
          ) : null}
        </div>
        {zones === null ? (
          <p className="px-6 py-4 text-sm text-slate-500">Loading…</p>
        ) : zones.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Truck className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
            <p className="mt-2 text-sm text-slate-600">No delivery options yet. Without one, customers pay for their items only.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {zones.map((z) => (
              <li key={z.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="text-sm">
                  <p className="font-medium text-slate-900">
                    {z.name} {!z.isActive ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Hidden</span> : null}
                  </p>
                  <p className="text-slate-600">
                    {price(z)}
                    {z.etaText ? ` · ${z.etaText}` : ""}
                    {z.regions.length ? ` · ${z.regions.join(", ")}` : ""}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => edit(z)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit<span className="sr-only"> {z.name}</span>
                    </button>
                    <button type="button" onClick={() => remove(z)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-red-50 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete<span className="sr-only"> {z.name}</span>
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {draft ? (
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6" noValidate aria-labelledby="zone-form-title">
          <h2 id="zone-form-title" className="text-base font-semibold text-slate-900">
            {draft.id ? `Edit “${draft.name}”` : "New delivery option"}
          </h2>
          <DashField id="zone-name" label="Name customers see" hint="For example “Lagos delivery” or “Nationwide courier”.">
            <input id="zone-name" className={dashInput} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-describedby="zone-name-hint" />
          </DashField>
          <label className="flex items-center gap-3 text-sm text-slate-800">
            <input type="checkbox" checked={draft.isPickup} onChange={(e) => setDraft({ ...draft, isPickup: e.target.checked })} className="h-4 w-4" />
            This is collection in person (always free, no address needed)
          </label>
          {!draft.isPickup ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DashField id="zone-fee" label="Charge per order">
                <input id="zone-fee" className={dashInput} type="number" min={0} step="any" inputMode="decimal" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} />
              </DashField>
              <DashField id="zone-free" label="Free on orders over" optional>
                <input id="zone-free" className={dashInput} type="number" min={0} step="any" inputMode="decimal" value={draft.freeOver} onChange={(e) => setDraft({ ...draft, freeOver: e.target.value })} />
              </DashField>
            </div>
          ) : null}
          <DashField id="zone-eta" label={draft.isPickup ? "Collection details" : "Delivery time"} optional hint={draft.isPickup ? "For example “Ready in 24 hours from our Ikeja shop”." : "For example “1 to 3 working days”."}>
            <input id="zone-eta" className={dashInput} value={draft.etaText} onChange={(e) => setDraft({ ...draft, etaText: e.target.value })} aria-describedby="zone-eta-hint" />
          </DashField>
          {!draft.isPickup ? (
            <DashField id="zone-regions" label="Areas covered" optional hint="Separate with commas, for example “Lagos, Ogun”. For your own reference.">
              <input id="zone-regions" className={dashInput} value={draft.regions} onChange={(e) => setDraft({ ...draft, regions: e.target.value })} aria-describedby="zone-regions-hint" />
            </DashField>
          ) : null}
          <label className="flex items-center gap-3 text-sm text-slate-800">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4" />
            Customers can choose this option
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Saving…" : "Save option"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-sm font-medium text-slate-600 hover:underline">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
