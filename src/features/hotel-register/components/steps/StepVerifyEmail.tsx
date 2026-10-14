"use client";

import { useRef, useState } from "react";
import { Clock } from "lucide-react";
import OtpCountdown from "@/features/hotel-register/components/OtpCountdown";
import { ErrorBanner, PRIMARY_BUTTON_CLASS, Spinner } from "@/features/hotel-register/components/fields";
import { useHotelRegisterStore } from "@/features/hotel-register/store";
import { cn } from "@/lib/utils";

export default function StepVerifyEmail() {
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [otpExpired, setOtpExpired] = useState(false);

  const otpExpiry = useHotelRegisterStore((s) => s.otpExpiry);
  const otp = useHotelRegisterStore((s) => s.otp);
  const setOtpDigit = useHotelRegisterStore((s) => s.setOtpDigit);
  const otpError = useHotelRegisterStore((s) => s.otpError);
  const error = useHotelRegisterStore((s) => s.error);
  const loading = useHotelRegisterStore((s) => s.loading);
  const verifyOtp = useHotelRegisterStore((s) => s.verifyOtp);
  const canResend = useHotelRegisterStore((s) => s.canResend);
  const resendCooldown = useHotelRegisterStore((s) => s.resendCooldown);
  const resendOtp = useHotelRegisterStore((s) => s.resendOtp);

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-black">Verification code</legend>
        <div className="flex gap-2">
          {otp.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                otpRefs.current[i] = el;
              }}
              value={d}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(-1);
                setOtpDigit(i, v);
                if (v && i < 5) otpRefs.current[i + 1]?.focus();
              }}
              className={cn(
                "h-14 w-full min-w-0 max-w-12 rounded-xl border bg-white text-center text-2xl font-bold text-black transition-colors focus:outline-none focus:ring-2",
                otpError ? "border-rose-500 bg-rose-50/20 focus:ring-rose-400" : "border-slate-300 focus:border-transparent focus:ring-xyvoo-blue",
              )}
              maxLength={1}
              inputMode="numeric"
              aria-label={`Verification code digit ${i + 1} of 6`}
              aria-invalid={Boolean(otpError) || undefined}
              aria-describedby={otpError ? "otp-error" : "otp-expiry"}
              autoComplete={i === 0 ? "one-time-code" : "off"}
            />
          ))}
        </div>
        {otpError ? (
          <p id="otp-error" role="alert" className="mt-1.5 text-sm font-semibold text-rose-700">
            {otpError}
          </p>
        ) : null}
      </fieldset>

      <div id="otp-expiry">
        {otpExpiry && !otpExpired ? (
          <p className="flex items-center gap-1.5 text-sm text-slate-700">
            <Clock className="h-4 w-4 text-slate-500" aria-hidden />
            Code expires in <OtpCountdown expiresAt={otpExpiry} onExpired={() => setOtpExpired(true)} />
          </p>
        ) : null}
        {otpExpired ? (
          <p role="alert" className="text-sm font-semibold text-rose-700">
            Code expired. Please resend.
          </p>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-6">
        <button type="button" onClick={() => verifyOtp()} disabled={loading || otpExpired} className={PRIMARY_BUTTON_CLASS}>
          {loading ? (
            <>
              <Spinner />
              <span className="sr-only">Checking your code…</span>
            </>
          ) : (
            "Verify"
          )}
        </button>

        <p className="text-center text-sm text-slate-700">
          {canResend ? (
            <>
              Didn&rsquo;t get it?{" "}
              <button
                type="button"
                onClick={() => resendOtp()}
                className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-xyvoo-blue-deep underline underline-offset-2 hover:text-black"
              >
                Resend code
              </button>
            </>
          ) : (
            <span className="inline-flex min-h-11 items-center">
              You can resend the code in&nbsp;<span className="font-mono font-bold">{resendCooldown}s</span>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
