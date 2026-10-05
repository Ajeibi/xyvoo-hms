"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Eye, EyeOff, MailCheck } from "lucide-react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { XYVOO_AUTH_ROUTES, type XyvooAuthProduct } from "@/constants/auth-links";

type Step = "email" | "reset" | "done";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue";

/**
 * Forgotten password, for HMS and Storefront accounts alike: we email a
 * 6-digit code, then the code and a new password reset it. `product` only
 * decides which sign-in page to go back to.
 */
export default function ForgotPasswordForm({ product }: { product: XyvooAuthProduct }) {
  const loginHref = XYVOO_AUTH_ROUTES[product].login;

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  const post = async (url: string, body: object) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  };

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { ok, data } = await post("/api/auth/password-reset/request", { email });
      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "We couldn't send a code. Please try again.");
        return;
      }
      setSentTo(data.sentTo || email);
      setStep("reset");
      window.setTimeout(() => heading.current?.focus(), 0);
    } catch {
      setError("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from the email.");
    if (password.length < 8) return setError("Use at least 8 characters for your new password.");
    if (password !== confirmPassword) return setError("The two passwords don't match.");

    setBusy(true);
    try {
      const { ok, data } = await post("/api/auth/password-reset/confirm", { email, code, password });
      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "We couldn't reset your password. Please try again.");
        return;
      }
      setStep("done");
      window.setTimeout(() => heading.current?.focus(), 0);
    } catch {
      setError("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const errorBox = error ? (
    <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      <p>{error}</p>
    </div>
  ) : null;

  return (
    <WebsiteLayout compactMain>
      <div className="bg-slate-50 px-4 pb-28 pt-28">
        <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8">
          {step === "email" ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
              <p className="text-sm text-slate-500">Enter the email address you sign in with. We&rsquo;ll email you a code to choose a new password.</p>
              <form onSubmit={requestCode} className="space-y-3" noValidate>
                <label htmlFor="reset-email" className="block text-xs font-medium text-slate-600">
                  Email address
                </label>
                <input
                  id="reset-email"
                  className={inputClass}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setError("");
                    setEmail(e.target.value);
                  }}
                  required
                  autoFocus
                />
                {errorBox}
                <button disabled={busy || !email} type="submit" className="w-full rounded-xl bg-xyvoo-blue py-3 font-semibold text-white disabled:opacity-60">
                  {busy ? "Sending…" : "Email me a code"}
                </button>
              </form>
            </>
          ) : null}

          {step === "reset" ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900" tabIndex={-1} ref={heading}>
                Choose a new password
              </h1>
              <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" role="status">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <p>If {sentTo} has a XYVOO account, we&rsquo;ve emailed it a 6-digit code. It expires in 10 minutes.</p>
              </div>
              <form onSubmit={resetPassword} className="space-y-3" noValidate>
                <div>
                  <label htmlFor="reset-code" className="mb-1 block text-xs font-medium text-slate-600">
                    6-digit code
                  </label>
                  <input
                    id="reset-code"
                    className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      setError("");
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="reset-password" className="mb-1 block text-xs font-medium text-slate-600">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="reset-password"
                      className={`${inputClass} pr-11`}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setError("");
                        setPassword(e.target.value);
                      }}
                      aria-describedby="reset-password-hint"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p id="reset-password-hint" className="mt-1 text-xs text-slate-400">
                    At least 8 characters.
                  </p>
                </div>
                <div>
                  <label htmlFor="reset-password-confirm" className="mb-1 block text-xs font-medium text-slate-600">
                    Confirm new password
                  </label>
                  <input
                    id="reset-password-confirm"
                    className={inputClass}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setError("");
                      setConfirmPassword(e.target.value);
                    }}
                  />
                </div>
                {errorBox}
                <button disabled={busy} type="submit" className="w-full rounded-xl bg-xyvoo-blue py-3 font-semibold text-white disabled:opacity-60">
                  {busy ? "Saving…" : "Save new password"}
                </button>
              </form>
              <p className="text-sm text-slate-500">
                No email after a few minutes? Check your spam folder, or{" "}
                <button type="button" className="text-blue-600 hover:underline" onClick={() => requestCode()} disabled={busy}>
                  send a new code
                </button>
                .
              </p>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
              <h1 className="text-2xl font-bold text-slate-900" tabIndex={-1} ref={heading}>
                Your password has been changed
              </h1>
              <p className="text-sm text-slate-500">You can now sign in with your new password.</p>
              <Link href={loginHref} className="block w-full rounded-xl bg-xyvoo-blue py-3 text-center font-semibold text-white">
                Sign in
              </Link>
            </>
          ) : null}

          {step !== "done" ? (
            <p className="text-sm text-slate-500">
              Remembered it?{" "}
              <Link className="text-blue-600 hover:underline" href={loginHref}>
                Back to sign in
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </WebsiteLayout>
  );
}
