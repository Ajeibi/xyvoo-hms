"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import {
  UPSELL_KIND_LABELS,
  UPSELL_KINDS,
  UPSELL_UNIT_LABELS,
  UPSELL_UNITS,
  type UpsellKind,
  type UpsellOffer,
  type UpsellUnit,
} from "@/lib/hms/upsells-shared";

function OfferRow({ slug, offer, currency, canManage, onChanged }: { slug: string; offer: UpsellOffer; currency: string; canManage: boolean; onChanged: () => void }) {
  const [price, setPrice] = useState(String(offer.price));
  const [busy, setBusy] = useState(false);
  const priceChanged = Number(price) !== offer.price;

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/upsells", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, id: offer.id, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Not saved", json.error ?? "Try again.");
        return;
      }
      toastSuccess(done);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">
          {offer.name} <span className="font-normal text-slate-600">· {UPSELL_KIND_LABELS[offer.kind]}</span>
        </p>
        <p className="text-slate-600">
          {formatPricingAmount(offer.price, currency)} {UPSELL_UNIT_LABELS[offer.unit]}
          {offer.description ? ` · ${offer.description}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <HmsPill tone={offer.active ? "green" : "slate"}>{offer.active ? "Offered" : "Hidden"}</HmsPill>
        {canManage ? (
          <>
            <input
              aria-label={`Price for ${offer.name}`}
              className={hmsInput}
              style={{ width: 120 }}
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            {priceChanged ? (
              <button type="button" className={hmsButton.primary} disabled={busy || price.trim() === "" || Number.isNaN(Number(price))} onClick={() => void patch({ price: Number(price) }, "Price saved")}>
                Save price
              </button>
            ) : null}
            <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void patch({ active: !offer.active }, offer.active ? "Hidden from the desk" : "Offered again")}>
              {offer.active ? "Hide" : "Offer again"}
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

export function FrontDeskUpsellsClient({ slug }: { slug: string }) {
  const [offers, setOffers] = useState<UpsellOffer[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [currency, setCurrency] = useState("NGN");
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<UpsellKind>("late_checkout");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<UpsellUnit>("flat");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel/frontdesk/upsells?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setOffers(json.offers ?? []);
      setCanManage(Boolean(json.canManage));
      if (json.currency) setCurrency(json.currency);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotel/frontdesk/upsells", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, kind, name, price: Number(price), unit }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save the offer.");
        return;
      }
      toastSuccess("Offer added");
      setName("");
      setPrice("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="money"
        title="Extras at check-in"
        description="The upgrades, late check-outs and breakfasts the desk can offer a guest. When a guest says yes, the price goes on their bill."
      />

      <HmsCard
        id="offers"
        icon={Sparkles}
        meaning="money"
        title="What the desk can offer"
        description={loading ? "Loading…" : `${offers.filter((o) => o.active).length} offered, ${offers.filter((o) => !o.active).length} hidden.`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />
        ) : offers.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing is set up yet. Add the first extra below.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {offers.map((o) => (
              <OfferRow key={o.id} slug={slug} offer={o} currency={currency} canManage={canManage} onChanged={() => void load()} />
            ))}
          </ul>
        )}
      </HmsCard>

      {canManage ? (
        <HmsCard id="add-offer" icon={Sparkles} meaning="money" title="Add an extra" description="Prices are what the guest pays, taxes included.">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <HmsField id="up-kind" label="Kind">
                <select id="up-kind" className={hmsInput} value={kind} onChange={(e) => setKind(e.target.value as UpsellKind)}>
                  {UPSELL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {UPSELL_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </HmsField>
              <HmsField id="up-name" label="Name on the bill">
                <input id="up-name" className={hmsInput} maxLength={80} placeholder="Late check-out until 4pm" value={name} onChange={(e) => setName(e.target.value)} />
              </HmsField>
              <HmsField id="up-price" label={`Price (${currency})`}>
                <input id="up-price" className={hmsInput} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </HmsField>
              <HmsField id="up-unit" label="Charged">
                <select id="up-unit" className={hmsInput} value={unit} onChange={(e) => setUnit(e.target.value as UpsellUnit)}>
                  {UPSELL_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {UPSELL_UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
              </HmsField>
            </div>
            {error ? <HmsAlert message={error} /> : null}
            <button type="submit" className={hmsButton.primary} disabled={busy || !name.trim() || price.trim() === "" || Number.isNaN(Number(price))}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Add extra
            </button>
          </form>
        </HmsCard>
      ) : (
        <p className="text-sm text-slate-600">Only a manager can change the offers and prices.</p>
      )}
    </HmsPage>
  );
}
