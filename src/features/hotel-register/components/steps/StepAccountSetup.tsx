"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { INPUT_CLASS } from "@/features/hotel-register/constants";
import { passwordStrength } from "@/features/hotel-register/utils";
import { useHotelRegisterStore } from "@/features/hotel-register/store";

export default function StepAccountSetup() {
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const account = useHotelRegisterStore((s) => s.account);
  const accountError = useHotelRegisterStore((s) => s.accountError);
  const loading = useHotelRegisterStore((s) => s.loading);
  const setAccountField = useHotelRegisterStore((s) => s.setAccountField);
  const saveAccountDetails = useHotelRegisterStore((s) => s.saveAccountDetails);
  const pwStrength = passwordStrength(account.password);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <h2 className="mb-1 text-2xl font-bold text-xyvoo-navy">Set up your account</h2>
      <p className="text-slate-500 text-sm mb-6">Almost done — just a few more details.</p>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Contact Name <span className="text-slate-400 font-normal">(optional)</span></label>
          <input value={account.contact_name} onChange={(e) => setAccountField("contact_name", e.target.value)} className={INPUT_CLASS} placeholder="John Doe" />
          <p className="text-xs text-slate-400 mt-1">Primary contact name for this account (optional). Displayed where your profile appears when signed in.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Password *</label>
          <div className="relative">
            <input type={showPw ? "text" : "password"} value={account.password} onChange={(e) => setAccountField("password", e.target.value)} className={`${INPUT_CLASS} pr-10`} placeholder="Min 8 chars, uppercase, number, symbol" />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {account.password && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">{[1, 2, 3, 4].map((i) => <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= pwStrength.score ? pwStrength.color : "bg-slate-200"}`} />)}</div>
              <p className="text-xs text-slate-400">Strength: <span className="font-semibold">{pwStrength.label}</span></p>
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Confirm Password *</label>
          <div className="relative">
            <input type={showCpw ? "text" : "password"} value={account.confirm} onChange={(e) => setAccountField("confirm", e.target.value)} className={`${INPUT_CLASS} pr-10`} placeholder="Re-enter password" />
            <button type="button" onClick={() => setShowCpw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
              {showCpw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {account.confirm && account.password !== account.confirm && <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>}
          {account.confirm && account.password === account.confirm && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Passwords match</p>}
        </div>
        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
          <input type="checkbox" checked={account.whatsapp} onChange={(e) => setAccountField("whatsapp", e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-800">WhatsApp notifications</p>
            <p className="text-xs text-slate-400 mt-0.5">Receive important onboarding and account alerts on WhatsApp.</p>
          </div>
        </label>
        {accountError && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {accountError}</div>}
        <button
          onClick={saveAccountDetails}
          disabled={loading}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-xyvoo-blue py-3.5 font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Continue to Plan →"}
        </button>
      </div>
    </div>
  );
}
