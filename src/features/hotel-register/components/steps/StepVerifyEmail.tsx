"use client";

import { useRef, useState } from "react";
import { Clock, Mail } from "lucide-react";
import OtpCountdown from "@/features/hotel-register/components/OtpCountdown";
import { useHotelRegisterStore } from "@/features/hotel-register/store";

export default function StepVerifyEmail() {
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [otpExpired, setOtpExpired] = useState(false);

  const hotelEmail = useHotelRegisterStore((s) => s.hotel.contact_email);
  const otpExpiry = useHotelRegisterStore((s) => s.otpExpiry);
  const otp = useHotelRegisterStore((s) => s.otp);
  const setOtpDigit = useHotelRegisterStore((s) => s.setOtpDigit);
  const otpError = useHotelRegisterStore((s) => s.otpError);
  const loading = useHotelRegisterStore((s) => s.loading);
  const verifyOtp = useHotelRegisterStore((s) => s.verifyOtp);
  const canResend = useHotelRegisterStore((s) => s.canResend);
  const resendCooldown = useHotelRegisterStore((s) => s.resendCooldown);
  const resendOtp = useHotelRegisterStore((s) => s.resendOtp);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4"><Mail className="w-8 h-8 text-blue-600" /></div>
      <h2 className="mb-1 text-xl font-bold text-xyvoo-navy">Verify your email</h2>
      <p className="text-slate-500 text-sm mb-2">We sent a 6-digit code to <strong>{hotelEmail}</strong></p>

      {otpExpiry && !otpExpired && (
        <div className="flex items-center justify-center gap-1.5 text-sm text-slate-500 mb-4">
          <Clock className="w-3.5 h-3.5" />
          Code expires in <OtpCountdown expiresAt={otpExpiry} onExpired={() => setOtpExpired(true)} />
        </div>
      )}
      {otpExpired && <p className="text-sm text-red-500 mb-4">Code expired. Please resend.</p>}

      <div className="flex justify-center gap-2 mb-2">
        {otp.map((d, i) => (
          <input
            key={i}
            ref={(el) => { otpRefs.current[i] = el; }}
            value={d}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(-1);
              setOtpDigit(i, v);
              if (v && i < 5) otpRefs.current[i + 1]?.focus();
            }}
            className="w-12 h-14 text-center text-2xl font-bold border-2 border-slate-200 rounded-xl focus:outline-none transition-all"
            maxLength={1}
            inputMode="numeric"
          />
        ))}
      </div>
      {otpError && <p className="text-sm text-red-500 mb-2">{otpError}</p>}

      <button
        onClick={() => verifyOtp()}
        disabled={loading || otpExpired}
        className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-xyvoo-blue py-3.5 font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Verify →"}
      </button>

      <div className="mt-4 text-xs text-slate-400">
        {canResend ? (
          <button onClick={() => resendOtp()} className="text-blue-600 font-semibold hover:underline cursor-pointer">Resend code</button>
        ) : (
          <span>Resend available in <span className="font-mono font-bold">{resendCooldown}s</span></span>
        )}
      </div>
    </div>
  );
}
