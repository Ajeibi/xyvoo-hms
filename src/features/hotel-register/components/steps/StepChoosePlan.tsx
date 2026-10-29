"use client";

import { Check } from "lucide-react";
import { BILLING_CYCLES, FEATURES } from "@/features/hotel-register/constants";
import { ErrorBanner, PRIMARY_BUTTON_CLASS, Spinner } from "@/features/hotel-register/components/fields";
import { useHotelRegisterStore } from "@/features/hotel-register/store";

export default function StepChoosePlan() {
  const billingCycle = useHotelRegisterStore((s) => s.billingCycle);
  const setBillingCycle = useHotelRegisterStore((s) => s.setBillingCycle);
  const error = useHotelRegisterStore((s) => s.error);
  const loading = useHotelRegisterStore((s) => s.loading);
  const startTrial = useHotelRegisterStore((s) => s.startTrial);

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      <fieldset>
        <legend className="sr-only">Choose a billing cycle</legend>
        <div className="grid gap-4 pt-3">
          {BILLING_CYCLES.map((c) => {
            const selected = billingCycle === c.id;
            return (
              <label
                key={c.id}
                className={`relative flex cursor-pointer gap-3 rounded-2xl border-2 p-5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-xyvoo-blue has-[:focus-visible]:ring-offset-2 ${
                  selected ? "border-xyvoo-blue bg-blue-50/50" : "border-slate-200 bg-white hover:border-slate-300"
                } ${c.badge ? "shadow-lg" : ""}`}
              >
                {c.badge ? (
                  <span className="absolute -top-3 left-5 rounded-full bg-xyvoo-blue-deep px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    {c.badge}
                  </span>
                ) : null}
                <input
                  type="radio"
                  name="billing-cycle"
                  value={c.id}
                  checked={selected}
                  onChange={() => setBillingCycle(c.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-xyvoo-blue-deep"
                />
                {/* One fixed layout for every cycle, so cards line up whatever the price's length. */}
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-base font-semibold text-slate-900">{c.label}</span>
                      <span className="mt-0.5 block text-sm text-slate-600">Commitment: {c.commitment}</span>
                    </span>
                    {c.saving ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{c.saving}</span>
                    ) : null}
                  </span>
                  <span className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-2xl font-bold text-slate-900">
                      {c.price}
                      <span className="text-sm font-medium text-slate-600">{c.period}</span>
                    </span>
                    <span className="text-sm text-slate-600">{c.effective}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <section aria-labelledby="plan-features-title" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 id="plan-features-title" className="text-base font-semibold text-slate-900">
          Everything included
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm text-slate-700 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-3 border-t border-slate-200 pt-6">
        <button type="button" onClick={startTrial} disabled={loading} className={PRIMARY_BUTTON_CLASS}>
          {loading ? (
            <>
              <Spinner />
              <span className="sr-only">Starting your trial…</span>
            </>
          ) : (
            "Start 14-day free trial"
          )}
        </button>
        <p className="text-center text-sm text-slate-600">No credit card required for trial · Cancel anytime</p>
      </div>
    </div>
  );
}
