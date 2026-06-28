"use client";

import { AlertCircle } from "lucide-react";
import PhoneInput from "react-phone-number-input";
import Link from "next/link";
import { HOTEL_TYPES, INPUT_CLASS } from "@/features/hotel-register/constants";
import AddressAutocomplete from "@/features/hotel-register/components/AddressAutocomplete";
import CityAutocomplete from "@/features/hotel-register/components/CityAutocomplete";
import CountryDropdown from "@/features/hotel-register/components/CountryDropdown";
import { useHotelRegisterStore } from "@/features/hotel-register/store";

export default function StepHotelDetails() {
  const hotel = useHotelRegisterStore((s) => s.hotel);
  const error = useHotelRegisterStore((s) => s.error);
  const loading = useHotelRegisterStore((s) => s.loading);
  const sendOtp = useHotelRegisterStore((s) => s.sendOtp);
  const setHotelField = useHotelRegisterStore((s) => s.setHotelField);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <h1 className="mb-1 text-2xl font-bold text-xyvoo-navy">Register your hotel</h1>
      <p className="text-slate-500 text-sm mb-6">Start your free 14-day trial. No credit card required.</p>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Hotel Name *</label>
          <input value={hotel.hotel_name} onChange={(e) => setHotelField("hotel_name", e.target.value)} className={INPUT_CLASS} placeholder="Grand Palace Hotel" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Hotel Email *</label>
          <input type="email" value={hotel.contact_email} onChange={(e) => setHotelField("contact_email", e.target.value)} className={INPUT_CLASS} placeholder="admin@grandpalace.com" />
          <p className="text-xs text-slate-400 mt-1">This becomes your login and appears on guest-facing outputs.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Phone Number *</label>
          <PhoneInput international defaultCountry="NG" value={hotel.contact_phone} onChange={(val) => setHotelField("contact_phone", val || "")} className="phone-input-wrapper" style={{ ["--PhoneInputCountryFlag-height" as string]: "1em" }} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Country *</label>
          <CountryDropdown value={hotel.country} onChange={(v) => { setHotelField("country", v); setHotelField("city", ""); }} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">City *</label>
          <CityAutocomplete value={hotel.city} onChange={(v) => setHotelField("city", v)} country={hotel.country} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Hotel Address *</label>
          <AddressAutocomplete value={hotel.address} onChange={(v) => setHotelField("address", v)} country={hotel.country} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Number of Rooms *</label>
            <input type="number" min="1" value={hotel.room_count} onChange={(e) => setHotelField("room_count", e.target.value)} className={INPUT_CLASS} placeholder="50" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Hotel Type *</label>
            <select className={INPUT_CLASS} value={hotel.hotel_type} onChange={(e) => setHotelField("hotel_type", e.target.value)}>
              <option value="">Select type...</option>
              {HOTEL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>
        <label className="text-xs text-slate-600 leading-relaxed font-normal flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={hotel.agreed} onChange={(e) => setHotelField("agreed", e.target.checked)} className="mt-0.5" />
          <span>I agree to the <Link href="/terms" target="_blank" className="underline text-blue-600">Terms of Service</Link> and <Link href="/privacy" target="_blank" className="underline text-blue-600">Privacy Policy</Link>.</span>
        </label>
        {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}</div>}
        <button
          onClick={sendOtp}
          disabled={loading}
          className="flex h-auto w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-xyvoo-blue py-3.5 font-semibold text-white transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Continue →"}
        </button>
      </div>
    </div>
  );
}
