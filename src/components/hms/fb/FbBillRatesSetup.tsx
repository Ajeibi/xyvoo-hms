"use client";

import { useState } from "react";
import { Loader2, Percent } from "lucide-react";
import { computeBillTotals, FB_RATE_LIMITS, type FbBillRates } from "@/lib/hms/fb-bill-rules";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsAlert, HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { cn } from "@/lib/utils";

const EXAMPLE_ITEMS = 10000;

/** Service charge, state levy and VAT on restaurant and bar bills. */
export function FbBillRatesSetup({
  slug,
  currency,
  initial,
}: {
  slug: string;
  currency: string;
  initial: FbBillRates;
}) {
  const [saved, setSaved] = useState(initial);
  const [service, setService] = useState(String(initial.service_charge_percent || ""));
  const [levy, setLevy] = useState(String(initial.levy_percent || ""));
  const [vat, setVat] = useState(String(initial.vat_percent || ""));
  const [included, setIncluded] = useState(initial.prices_include_tax);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const draft: FbBillRates = {
    service_charge_percent: Number(service) || 0,
    levy_percent: Number(levy) || 0,
    vat_percent: Number(vat) || 0,
    prices_include_tax: included,
  };
  const example = computeBillTotals(EXAMPLE_ITEMS, draft);
  const money = (n: number) => formatPricingAmount(n, currency);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/hotel/fb/bill-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          serviceChargePercent: draft.service_charge_percent,
          levyPercent: draft.levy_percent,
          vatPercent: draft.vat_percent,
          pricesIncludeTax: draft.prices_include_tax,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save. Try again.");
        return;
      }
      setSaved(data.billRates);
      toastSuccess("Saved", "New bills use these rates. Bills already open keep theirs.");
    } catch {
      toastError("Could not save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const rateInput = (id: string, label: string, value: string, set: (v: string) => void, max: number, hint: string) => (
    <HmsField id={id} label={label} hint={hint}>
      <div className="relative max-w-36">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step="0.01"
          value={value}
          placeholder="0"
          disabled={saving}
          onChange={(e) => set(e.target.value)}
          aria-describedby={`${id}-hint`}
          className={cn(hmsInput, "pr-8")}
        />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
          %
        </span>
      </div>
    </HmsField>
  );

  return (
    <HmsCard
      id="bill-rates"
      icon={Percent}
      meaning="food"
      title="Service charge and taxes"
      description="Added to restaurant and bar bills. Changes apply to bills opened from now on; open bills keep the rates they started with."
      className="mt-6 scroll-mt-24"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {rateInput("fb-rate-service", "Service charge", service, setService, FB_RATE_LIMITS.service, "Added on top of menu prices.")}
        {rateInput("fb-rate-levy", "State levy", levy, setLevy, FB_RATE_LIMITS.levy, "Consumption or hospitality levy.")}
        {rateInput("fb-rate-vat", "VAT", vat, setVat, FB_RATE_LIMITS.vat, "Nigeria's standard rate is 7.5%.")}
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={included}
          disabled={saving}
          onChange={(e) => setIncluded(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        <span>
          Menu prices already include the levy and VAT
          <span className="block text-xs text-slate-600">
            The bill shows them as included. Untick if they should be added on top.
          </span>
        </span>
      </label>

      <div className="mt-4 max-w-sm rounded-xl bg-slate-50 px-4 py-3 text-sm" aria-live="polite">
        <p className="mb-1 font-medium text-slate-800">Example: items worth {money(EXAMPLE_ITEMS)}</p>
        <dl className="space-y-0.5 text-slate-700">
          {example.serviceCharge > 0 ? (
            <div className="flex justify-between">
              <dt>Service charge</dt>
              <dd className="tabular-nums">{money(example.serviceCharge)}</dd>
            </div>
          ) : null}
          {example.levy > 0 ? (
            <div className="flex justify-between">
              <dt>State levy{example.taxIncluded ? " (included)" : ""}</dt>
              <dd className="tabular-nums">{money(example.levy)}</dd>
            </div>
          ) : null}
          {example.vat > 0 ? (
            <div className="flex justify-between">
              <dt>
                VAT
                {example.taxIncluded
                  ? example.serviceCharge > 0
                    ? " (in the prices, plus on the service charge)"
                    : " (included)"
                  : ""}
              </dt>
              <dd className="tabular-nums">{money(example.vat)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
            <dt>Guest pays</dt>
            <dd className="tabular-nums">{money(example.total)}</dd>
          </div>
        </dl>
      </div>

      <HmsAlert message={error} />
      <button
        type="button"
        disabled={saving || !changed}
        onClick={() => void save()}
        className={cn(hmsButton.primary, "mt-4")}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Save rates
      </button>
    </HmsCard>
  );
}
