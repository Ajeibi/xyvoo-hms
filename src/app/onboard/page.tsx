"use client";

import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, CreditCard, Palette, Zap } from "lucide-react";

const STEPS = [
  { id: 1, label: "Account & Billing", icon: CreditCard },
  { id: 2, label: "Property Identity", icon: Building2 },
  { id: 3, label: "Branding", icon: Palette },
  { id: 4, label: "Review & Activate", icon: Zap },
];

export default function OnboardPage() {
  const [step, setStep] = useState(1);

  return (
    <AdminLayout>
      <div className="px-8 py-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-slate-900">Onboard New Hotel</h1>
          <p className="text-sm text-slate-500 mt-0.5">Get this hotel live on XYVOO in minutes</p>
        </div>

        <div className="flex items-center mb-8 gap-1">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center flex-1 min-w-0">
                <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg w-full transition-all truncate ${active ? "bg-blue-50 text-blue-600" : done ? "text-emerald-600 bg-emerald-50" : "text-slate-400"}`}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" /> : <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="truncate">{s.label}</span>
                </div>
                {i < STEPS.length - 1 ? <div className={`w-4 h-px flex-shrink-0 mx-0.5 ${done ? "bg-emerald-300" : "bg-slate-200"}`} /> : null}
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          {step === 1 ? <>
            <h2 className="text-base font-semibold text-slate-900">Account & Billing</h2>
            <p className="text-sm text-slate-500">Who is signing up, and how do they want to be billed?</p>
            <div className="grid grid-cols-2 gap-4">
              <input placeholder="Full Name" className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm" />
              <input placeholder="Email Address" className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm" />
            </div>
          </> : null}
          {step === 2 ? <>
            <h2 className="text-base font-semibold text-slate-900">Property Identity</h2>
            <p className="text-sm text-slate-500">What staff and guests will see.</p>
            <input placeholder="Official Hotel Name" className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm" />
            <input placeholder="Subdomain" className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-mono" />
          </> : null}
          {step === 3 ? <>
            <h2 className="text-base font-semibold text-slate-900">Branding</h2>
            <p className="text-sm text-slate-500">How the hotel system looks to staff and guests.</p>
            <div className="grid grid-cols-2 gap-4">
              <input type="color" defaultValue="#1e3a5f" className="w-full h-10 rounded-lg border border-slate-200" />
              <input type="color" defaultValue="#c9a84c" className="w-full h-10 rounded-lg border border-slate-200" />
            </div>
          </> : null}
          {step === 4 ? <>
            <h2 className="text-base font-semibold text-slate-900">Review & Activate</h2>
            <p className="text-sm text-slate-500">Everything looks good? Activate to provision this hotel system.</p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-slate-600">Activation will provision tenant, create staff owner, and launch setup wizard.</div>
          </> : null}
        </div>

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 bg-white rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          {step < 4 ? (
            <button onClick={() => setStep((s) => Math.min(4, s + 1))} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-all cursor-pointer">
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 shadow-sm transition-all cursor-pointer">
              <Zap className="w-4 h-4" /> Activate Hotel
            </button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
