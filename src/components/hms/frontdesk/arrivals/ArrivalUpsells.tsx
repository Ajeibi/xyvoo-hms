"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { UPSELL_KIND_LABELS, UPSELL_UNIT_LABELS, type AcceptedUpsell, type UpsellKind, type UpsellOffer } from "@/lib/hms/upsells-shared";

type Priced = UpsellOffer & { amount: number };

export function ArrivalUpsells({
  slug,
  reservationId,
  canAdd,
  onChanged,
}: {
  slug: string;
  reservationId: string;
  /** The desk may put charges on the bill and the stay is not over. */
  canAdd: boolean;
  onChanged?: () => void;
}) {
  const url = `/api/hotel/frontdesk/arrivals/${reservationId}/upsells`;
  const [offers, setOffers] = useState<Priced[]>([]);
  const [accepted, setAccepted] = useState<AcceptedUpsell[]>([]);
  const [currency, setCurrency] = useState("NGN");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${url}?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setOffers(json.offers ?? []);
      setAccepted(json.accepted ?? []);
      if (json.currency) setCurrency(json.currency);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [url, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(o: Priced) {
    if (!window.confirm(`Add ${o.name} (${formatPricingAmount(o.amount, currency)}) to this guest's bill?`)) return;
    setBusyId(o.id);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, offerId: o.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Not added", json.error ?? "Try again.");
        return;
      }
      toastSuccess(`${o.name} added to the bill`);
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />;

  const taken = new Set(accepted.map((a) => a.offerId));
  const open = offers.filter((o) => !taken.has(o.id));

  return (
    <div className="space-y-4">
      {offers.length === 0 && accepted.length === 0 ? (
        <p className="text-sm text-slate-600">
          No extras are set up yet.{" "}
          <Link className="font-medium text-blue-800 underline" href={`/hms/${slug}/frontdesk/upsells`}>
            Set the offers and prices
          </Link>
          .
        </p>
      ) : null}

      {open.length > 0 ? (
        <ul className="space-y-2">
          {open.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {o.name} <span className="font-normal text-slate-600">· {UPSELL_KIND_LABELS[o.kind as UpsellKind]}</span>
                </p>
                <p className="text-xs text-slate-600">
                  {formatPricingAmount(o.price, currency)} {UPSELL_UNIT_LABELS[o.unit]}
                  {o.unit !== "flat" ? ` · ${formatPricingAmount(o.amount, currency)} for this stay` : ""}
                </p>
                {o.description ? <p className="text-xs text-slate-600">{o.description}</p> : null}
              </div>
              {canAdd ? (
                <button type="button" className={hmsButton.primary} disabled={busyId !== null} onClick={() => void accept(o)}>
                  {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Add to bill
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {accepted.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Already on the bill</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {accepted.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-slate-900">
                  {a.name} <span className="text-slate-600">· {formatDateTime(a.acceptedAt)}</span>
                </span>
                <HmsPill tone="green">{formatPricingAmount(a.amount, currency)}</HmsPill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
