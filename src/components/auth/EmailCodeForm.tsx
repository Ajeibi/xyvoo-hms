"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, MailCheck } from "lucide-react";

const RESEND_SECONDS = 60;

/**
 * Enter-the-code step for confirming an email address. Used straight after
 * registering, and when someone tries to sign in before confirming.
 * `autoSend` asks for a fresh code on mount (the sign-in case); after
 * registering, the first code has already gone out.
 */
export default function EmailCodeForm({
  email,
  sentTo,
  autoSend = false,
  onVerified,
  accentClassName = "bg-xyvoo-teal-product-hover border-xyvoo-teal-product-hover hover:text-xyvoo-teal-product-hover",
}: {
  email: string;
  sentTo?: string;
  autoSend?: boolean;
  onVerified: () => void | Promise<void>;
  accentClassName?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState(sentTo ? `We've sent a 6-digit code to ${sentTo}.` : "");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(autoSend ? 0 : RESEND_SECONDS);
  const sentOnMount = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const send = async () => {
    setError("");
    setStatus("Sending a new code…");
    try {
      const res = await fetch("/api/auth/verify-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("");
        setError(typeof data.error === "string" ? data.error : "We couldn't send a code. Please try again.");
        return;
      }
      setStatus(`We've sent a 6-digit code to ${data.sentTo || email}. It may take a minute to arrive.`);
      setCooldown(RESEND_SECONDS);
      input.current?.focus();
    } catch {
      setStatus("");
      setError("We couldn't connect. Check your internet connection and try again.");
    }
  };

  useEffect(() => {
    if (!autoSend || sentOnMount.current) return;
    sentOnMount.current = true;
    void send();
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.");
      input.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "That code didn't work. Please try again.");
        input.current?.focus();
        return;
      }
      setStatus("Email confirmed.");
      await onVerified();
    } catch {
      setError("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={confirm} className="space-y-4" noValidate>
      <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <p role="status">{status || "Ask for a code and we'll email it to you."}</p>
      </div>

      {error ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <div>
        <label htmlFor="email-code" className="mb-1 block text-xs font-medium text-slate-600">
          6-digit code
        </label>
        <input
          ref={input}
          id="email-code"
          name="code"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-400"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => {
            setError("");
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
          }}
          aria-invalid={error ? true : undefined}
          autoFocus
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className={`w-full cursor-pointer rounded-2xl border-2 py-3 font-semibold text-white transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 ${accentClassName}`}
      >
        {busy ? "Checking…" : "Confirm email"}
      </button>

      <p className="text-center text-sm text-slate-500">
        Didn&rsquo;t get it? Check your spam folder, or{" "}
        <button
          type="button"
          onClick={send}
          disabled={cooldown > 0}
          className="font-medium text-slate-900 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
        >
          {cooldown > 0 ? `send a new code in ${cooldown}s` : "send a new code"}
        </button>
        .
      </p>
    </form>
  );
}
