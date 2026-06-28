"use client";

import { AlertCircle } from "lucide-react";
import { BILLING_CYCLES, FEATURES } from "@/features/hotel-register/constants";
import { useHotelRegisterStore } from "@/features/hotel-register/store";

export default function StepChoosePlan() {
  const billingCycle = useHotelRegisterStore((s) => s.billingCycle);
  const setBillingCycle = useHotelRegisterStore((s) => s.setBillingCycle);
  const error = useHotelRegisterStore((s) => s.error);
  const loading = useHotelRegisterStore((s) => s.loading);
  const startTrial = useHotelRegisterStore((s) => s.startTrial);
  const initiatePayment = useHotelRegisterStore((s) => s.initiatePayment);

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="mb-1 text-2xl font-bold text-xyvoo-navy">Choose your billing cycle</h2>
        <p className="text-slate-500 text-sm">All cycles include every feature. 14-day free trial — no card required.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {BILLING_CYCLES.map((c) => (
          <button key={c.id} onClick={() => setBillingCycle(c.id)} className={`relative text-left rounded-2xl p-4 border-2 transition-all cursor-pointer ${billingCycle === c.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            {c.badge ? (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-xyvoo-blue px-2 py-0.5 text-[10px] font-bold text-white">
                {c.badge}
              </span>
            ) : null}
            <p className="mb-1 text-sm font-bold text-xyvoo-navy">{c.label}</p>
            <p
              className={`text-lg font-black ${billingCycle === c.id ? "text-xyvoo-blue" : "text-xyvoo-navy"}`}
            >
              {c.price}
            </p>
            <p className="text-xs text-slate-400">{c.period}</p>
            <p className="text-xs text-slate-400 mt-2">{c.effective}</p>
            {"saving" in c ? <p className="text-xs font-bold text-green-600 mt-1">{c.saving}</p> : null}
            <p className="text-xs text-slate-400 mt-1">{c.commitment}</p>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Everything included</p>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4">
          {FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-4 h-4 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">✓</span>
              {f}
            </div>
          ))}
        </div>
      </div>

      {error ? <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}</div> : null}

      <button
        onClick={startTrial}
        disabled={loading}
        className="mb-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-xyvoo-blue py-4 text-base font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Start 14-Day Free Trial →"}
      </button>

      <button onClick={initiatePayment} disabled={loading} className="w-full py-3 border-2 border-slate-200 text-slate-600 text-sm font-semibold rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer disabled:cursor-not-allowed">
        Pay now & skip trial
      </button>
      <p className="text-center text-xs text-slate-400 mt-3">No credit card required for trial · Cancel anytime</p>
    </div>
  );
}
