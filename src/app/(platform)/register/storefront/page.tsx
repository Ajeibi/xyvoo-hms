"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { supabaseAuthBrowser } from "@/lib/supabase/auth-browser";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import EmailCodeForm from "@/components/auth/EmailCodeForm";
import { SubdomainInput } from "@/components/forms/SubdomainInput";
import type { GoogleCredentialResponse } from "@/lib/auth/google-identity";
import { slugifyStoreName as slugify } from "@/lib/store/subdomain";
import { readSignupIntent } from "@/lib/store/site/signup-intent";

export default function StorefrontRegisterPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // After the account is created, the same page asks for the emailed code.
  const [verification, setVerification] = useState<{ slug: string; sentTo?: string } | null>(null);
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const clearError = () => {
    if (error) setError("");
  };

  const handleStoreNameChange = (value: string) => {
    setStoreName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleGoogleCredential = async (response: GoogleCredentialResponse) => {
    setLoading(true);
    setError("");

    const { error: idTokenError } = await supabaseAuthBrowser.auth.signInWithIdToken({
      provider: "google",
      token: response.credential,
    });

    if (idTokenError) {
      setError(idTokenError.message);
      toastError("Google sign-in failed", idTokenError.message);
      setLoading(false);
      return;
    }

    try {
      const redirectRes = await fetch("/api/store/auth/post-login-redirect", { method: "POST" });
      const redirectData = await redirectRes.json().catch(() => ({}));

      toastSuccess("Signed in", "Welcome to XYVOO. Opening your dashboard…");
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Keep ?plan= / ?template= so the Google path pre-fills the wizard too.
      window.location.assign(redirectData.redirectTo || `/register/storefront/complete${window.location.search}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!acceptedTerms) {
      setError("Please agree to the terms and privacy policy to continue.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/store/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          storeName,
          slug,
          email,
          password,
          acceptedTerms,
          ...readSignupIntent(window.location.search),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Failed to register storefront.";
        setError(message);
        toastError("Registration failed", message);
        return;
      }

      setVerification({ slug: data.slug, sentTo: data.codeSent ? data.sentTo : undefined });
      window.scrollTo({ top: 0 });
    } catch {
      const message = "We couldn't reach the registration service. Check your internet connection and try again.";
      setError(message);
      toastError("Connection problem", message);
    } finally {
      setLoading(false);
    }
  };

  // Confirmed: sign in with the password still held in this page and open the dashboard.
  const handleVerified = async () => {
    if (!verification) return;
    const { error: signInError } = await supabaseAuthBrowser.auth.signInWithPassword({ email, password });
    if (signInError) {
      toastSuccess("Email confirmed", "Sign in to continue.");
      window.location.assign("/auth/login/storefront");
      return;
    }
    toastSuccess("Email confirmed", "Opening your dashboard…");
    window.location.assign(`/storefront/${verification.slug}/dashboard`);
  };

  const verifyStep = verification ? (
    <>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-xyvoo-teal-product-hover">XYVOO Storefront</p>
        <h1 className="text-4xl font-bold leading-tight text-slate-900">Check your email</h1>
        <p className="text-base leading-relaxed text-slate-600">
          Your store is set up. Enter the code we emailed you to confirm your address and open your dashboard.
        </p>
      </div>
      <EmailCodeForm email={email} sentTo={verification.sentTo} autoSend={!verification.sentTo} onVerified={handleVerified} />
    </>
  ) : null;

  const form = verifyStep ?? (
    <>
      <motion.div
        className="space-y-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-xyvoo-teal-product-hover">
          XYVOO Storefront
        </p>
        <h1 className="text-4xl font-bold text-slate-900 leading-tight">Register your storefront</h1>
        <motion.p
          className="text-base text-slate-600 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Set up your merchant account to start managing products and orders.
        </motion.p>
      </motion.div>

      {error ? (
        <motion.div
          role="alert"
          aria-live="polite"
          className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <p>{error}</p>
        </motion.div>
      ) : null}

      <GoogleSignInButton onCredential={handleGoogleCredential} className="flex w-full justify-center" />

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or register with email
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <motion.form
        onSubmit={handleSubmit}
        className="space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div>
          <label htmlFor="storefront-register-full-name" className="mb-1 block text-xs font-medium text-slate-600">
            Your full name
          </label>
          <input
            id="storefront-register-full-name"
            name="fullName"
            className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-xyvoo-teal-product-hover focus:border-transparent"
            autoComplete="name"
            value={fullName}
            onChange={(e) => {
              clearError();
              setFullName(e.target.value);
            }}
            required
          />
        </div>

        <div>
          <label htmlFor="storefront-register-phone" className="mb-1 block text-xs font-medium text-slate-600">
            Phone number
          </label>
          <input
            id="storefront-register-phone"
            name="phone"
            className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-xyvoo-teal-product-hover focus:border-transparent"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="e.g. 0803 123 4567"
            value={phone}
            onChange={(e) => {
              clearError();
              setPhone(e.target.value);
            }}
            aria-describedby="storefront-register-phone-hint"
            required
          />
          <p id="storefront-register-phone-hint" className="mt-1 text-xs text-slate-400">
            So we can reach you about your account. It isn&rsquo;t shown on your shop.
          </p>
        </div>

        <div>
          <label htmlFor="storefront-register-name" className="mb-1 block text-xs font-medium text-slate-600">
            Store name
          </label>
          <input
            id="storefront-register-name"
            name="storeName"
            className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-xyvoo-teal-product-hover focus:border-transparent"
            placeholder="e.g. Kaine & Co"
            autoComplete="organization"
            value={storeName}
            onChange={(e) => {
              clearError();
              handleStoreNameChange(e.target.value);
            }}
            required
          />
        </div>

        <div>
          <label htmlFor="storefront-register-slug" className="mb-1 block text-xs font-medium text-slate-600">
            Storefront URL
          </label>
          <SubdomainInput
            id="storefront-register-slug"
            name="slug"
            placeholder="your-store"
            value={slug}
            onChange={(e) => {
              clearError();
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            required
            ringClassName="focus-within:ring-xyvoo-teal-product-hover"
          />
          <p className="mt-1 text-xs text-slate-400">
            Lowercase letters, numbers, and hyphens only. This becomes your shop&rsquo;s web address.
          </p>
        </div>

        <div>
          <label htmlFor="storefront-register-email" className="mb-1 block text-xs font-medium text-slate-600">
            Email address
          </label>
          <input
            id="storefront-register-email"
            name="email"
            className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-xyvoo-teal-product-hover focus:border-transparent"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              clearError();
              setEmail(e.target.value);
            }}
            required
          />
        </div>

        <div>
          <label htmlFor="storefront-register-password" className="mb-1 block text-xs font-medium text-slate-600">
            Password
          </label>
          <div className="relative">
            <input
              id="storefront-register-password"
              name="password"
              className="w-full px-4 py-3 pr-11 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-xyvoo-teal-product-hover focus:border-transparent"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                clearError();
                setPassword(e.target.value);
              }}
              minLength={8}
              required
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="storefront-register-confirm-password"
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Confirm password
          </label>
          <input
            id="storefront-register-confirm-password"
            name="confirmPassword"
            className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-xyvoo-teal-product-hover focus:border-transparent"
            type={showPassword ? "text" : "password"}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              clearError();
              setConfirmPassword(e.target.value);
            }}
            minLength={8}
            required
          />
          {confirmPassword && password ? (
            <p className={`mt-1 text-xs ${confirmPassword === password ? "text-green-600" : "text-red-500"}`}>
              {confirmPassword === password ? "✓ Passwords match" : "Passwords do not match"}
            </p>
          ) : null}
        </div>

        <label className="flex items-start gap-3 text-sm text-slate-600">
          <input
            type="checkbox"
            name="acceptedTerms"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-xyvoo-teal-product-hover"
            checked={acceptedTerms}
            onChange={(e) => {
              clearError();
              setAcceptedTerms(e.target.checked);
            }}
            required
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="font-medium text-slate-900 underline" target="_blank">
              terms of service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-slate-900 underline" target="_blank">
              privacy policy
            </Link>
            .
          </span>
        </label>

        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-2xl border-2 border-xyvoo-teal-product-hover bg-xyvoo-teal-product-hover py-3 font-semibold text-white transition-transform duration-300 ease-in-out hover:rotate-[5deg] hover:bg-white hover:text-xyvoo-teal-product-hover disabled:opacity-60 disabled:hover:rotate-0 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Creating storefront..." : "Create storefront"}
        </button>
      </motion.form>

      <motion.p
        className="text-center text-sm text-slate-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        Already have a storefront?{" "}
        <Link className="font-medium text-slate-900 hover:underline" href="/auth/login/storefront">
          Sign in
        </Link>
      </motion.p>
    </>
  );

  return (
    <WebsiteLayout>
      {/* The form renders once so its ids stay unique; only the image treatment changes by breakpoint. */}
      <div className="relative w-full overflow-hidden bg-white pt-[76px] pb-16 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0">
        {/* Mobile: faded image behind the form */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden" aria-hidden>
          <Image src="/storefront-register.jpg" alt="" fill className="object-cover opacity-10" sizes="100vw" />
        </div>

        {/* Desktop: image sticks in view while the form scrolls past it, then the page continues into the CTA + footer */}
        <div className="relative hidden h-[calc(100vh-76px)] overflow-hidden bg-white lg:sticky lg:top-[76px] lg:block">
          <Image
            src="/storefront-register.jpg"
            alt="Register your storefront"
            fill
            className="object-cover"
            sizes="50vw"
            preload
          />
        </div>

        <div className="relative z-10 flex items-center justify-center p-6 lg:items-stretch lg:p-12">
          <div className="w-full max-w-sm space-y-6 lg:max-w-md lg:pb-20">{form}</div>
        </div>
      </div>
    </WebsiteLayout>
  );
}
