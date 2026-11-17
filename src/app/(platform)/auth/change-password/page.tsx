"use client";

import { useState } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import HotelAuthLayout from "@/features/hotel-register/components/HotelAuthLayout";
import { INPUT_CLASS } from "@/features/hotel-register/constants";
import { PRIMARY_BUTTON_CLASS } from "@/features/hotel-register/components/fields";
import { toastError, toastSuccess } from "@/lib/app-toast";

/** First sign-in for a new staff login (or after a reset): replace the temporary password before anything else. */
export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    if (pin && !/^\d{4,6}$/.test(pin)) return setError("The PIN is 4 to 6 digits.");
    setLoading(true);
    try {
      const res = await fetch("/api/hotel/staff/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Unable to change the password.";
        setError(message);
        toastError("Password not changed", message);
        return;
      }
      toastSuccess("Password changed", "Opening your department…");
      const next = await fetch("/api/auth/post-login-redirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const nextData = await next.json().catch(() => ({}));
      window.location.assign(nextData.redirectTo || "/auth/login");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <HotelAuthLayout imageAlt="A receptionist welcoming guests at a hotel front desk">
      <div className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-wider text-xyvoo-blue-deep">XYVOO Hotel</p>
        <h1 className="text-4xl font-bold leading-tight text-black">Choose your password</h1>
        <p className="text-base leading-relaxed text-black">
          Your manager gave you a temporary password. Set one only you know before you continue.
        </p>
      </div>

      {error ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-black">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              className={`${INPUT_CLASS} pr-12`}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-600 hover:text-slate-900"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-black">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            className={INPUT_CLASS}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="new-pin" className="mb-1.5 block text-sm font-medium text-black">
            Your PIN
          </label>
          <input
            id="new-pin"
            className={INPUT_CLASS}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
          <p className="mt-1 text-xs text-slate-600">4 to 6 digits. You use it to take over a shared screen. Staff must choose one; keep it to yourself.</p>
        </div>
        <button disabled={loading} type="submit" className={PRIMARY_BUTTON_CLASS}>
          {loading ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </HotelAuthLayout>
  );
}
