"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { INPUT_CLASS } from "@/features/hotel-register/constants";
import { ErrorBanner, Field, PasswordStrength, PRIMARY_BUTTON_CLASS, Spinner } from "@/features/hotel-register/components/fields";
import { useHotelRegisterStore } from "@/features/hotel-register/store";

const TOGGLE_CLASS =
  "absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-xl text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue";

export default function StepAccountSetup() {
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const account = useHotelRegisterStore((s) => s.account);
  const accountError = useHotelRegisterStore((s) => s.accountError);
  const loading = useHotelRegisterStore((s) => s.loading);
  const setAccountField = useHotelRegisterStore((s) => s.setAccountField);
  const saveAccountDetails = useHotelRegisterStore((s) => s.saveAccountDetails);

  const showStrength = account.password.length > 0 || passwordFocused;
  const mismatch = Boolean(account.confirm) && account.password !== account.confirm;

  return (
    <div className="space-y-4">
      <ErrorBanner message={accountError} />

      <Field
        id="account-contact-name"
        label="Contact name"
        optional
        hint="The main contact for this account. It's shown where your profile appears when you're signed in."
      >
        <input
          id="account-contact-name"
          autoComplete="name"
          value={account.contact_name}
          onChange={(e) => setAccountField("contact_name", e.target.value)}
          className={INPUT_CLASS}
          placeholder="e.g. John Doe"
          aria-describedby="account-contact-name-hint"
        />
      </Field>

      <div>
        <label htmlFor="account-password" className="mb-1.5 block text-sm font-medium text-black">
          Password
        </label>
        <div className="relative">
          <input
            id="account-password"
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={account.password}
            onChange={(e) => setAccountField("password", e.target.value)}
            onFocus={() => setPasswordFocused(true)}
            className={`${INPUT_CLASS} pr-12`}
            placeholder="Create a strong password"
            aria-describedby={showStrength ? "account-password-strength" : undefined}
          />
          <button type="button" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)} className={TOGGLE_CLASS}>
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {showStrength ? <PasswordStrength id="account-password-strength" password={account.password} /> : null}
      </div>

      <div>
        <label htmlFor="account-confirm-password" className="mb-1.5 block text-sm font-medium text-black">
          Confirm password
        </label>
        <div className="relative">
          <input
            id="account-confirm-password"
            type={showCpw ? "text" : "password"}
            autoComplete="new-password"
            value={account.confirm}
            onChange={(e) => setAccountField("confirm", e.target.value)}
            className={`${INPUT_CLASS} pr-12`}
            placeholder="Re-enter your password"
            aria-invalid={mismatch || undefined}
            aria-describedby={account.confirm ? "account-confirm-password-match" : undefined}
          />
          <button type="button" aria-label={showCpw ? "Hide password" : "Show password"} onClick={() => setShowCpw((v) => !v)} className={TOGGLE_CLASS}>
            {showCpw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {account.confirm ? (
          <p
            id="account-confirm-password-match"
            className={`mt-1.5 text-sm font-medium ${mismatch ? "text-rose-700" : "text-green-700"}`}
          >
            {mismatch ? "Passwords do not match" : "✓ Passwords match"}
          </p>
        ) : null}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:bg-slate-50">
        <input
          type="checkbox"
          checked={account.whatsapp}
          onChange={(e) => setAccountField("whatsapp", e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded accent-xyvoo-blue-deep"
          aria-describedby="account-whatsapp-hint"
        />
        <span>
          <span className="block text-sm font-medium text-black">WhatsApp notifications</span>
          <span id="account-whatsapp-hint" className="mt-0.5 block text-sm text-slate-600">
            Receive important onboarding and account alerts on WhatsApp.
          </span>
        </span>
      </label>

      <div className="border-t border-slate-200 pt-6">
        <button type="button" onClick={saveAccountDetails} disabled={loading} className={PRIMARY_BUTTON_CLASS}>
          {loading ? (
            <>
              <Spinner />
              <span className="sr-only">Saving your details…</span>
            </>
          ) : (
            "Continue to plan"
          )}
        </button>
      </div>
    </div>
  );
}
