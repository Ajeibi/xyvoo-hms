"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { supabaseAuthBrowser } from "@/lib/supabase/auth-browser";
import { toastError, toastSuccess } from "@/lib/app-toast";

function friendlySignInMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "The email or password doesn't match our records. Check both fields and try again.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirm your email address before signing in.";
  }
  return message || "Something went wrong. Please try again.";
}

export default function StorefrontLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const clearError = () => {
    if (error) setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: signInError } = await supabaseAuthBrowser.auth.signInWithPassword({ email, password });
      if (signInError) {
        const message = friendlySignInMessage(signInError.message);
        setError(message);
        toastError("Sign-in failed", message);
        return;
      }

      const redirectRes = await fetch("/api/store/auth/post-login-redirect", { method: "POST" });
      const redirectData = await redirectRes.json().catch(() => ({}));

      if (!redirectRes.ok) {
        const message =
          typeof redirectData.error === "string"
            ? redirectData.error
            : "We signed you in but couldn't open your dashboard. Please try again.";
        setError(message);
        toastError("Redirect failed", message);
        return;
      }

      toastSuccess("Signed in", "Welcome back. Opening your dashboard…");
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.location.assign(redirectData.redirectTo || "/register/storefront");
    } catch {
      const message = "We couldn't reach the sign-in service. Check your internet connection and try again.";
      setError(message);
      toastError("Connection problem", message);
    } finally {
      setLoading(false);
    }
  };

  const form = (
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
        <h1 className="text-4xl font-bold text-slate-900 leading-tight">Sign in</h1>
        <motion.p
          className="text-base text-slate-600 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Use the account created when you registered your storefront.
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

      <motion.form
        onSubmit={handleSubmit}
        className="space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div>
          <label htmlFor="storefront-login-email" className="mb-1 block text-xs font-medium text-slate-600">
            Email address
          </label>
          <input
            id="storefront-login-email"
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
          <label htmlFor="storefront-login-password" className="mb-1 block text-xs font-medium text-slate-600">
            Password
          </label>
          <div className="relative">
            <input
              id="storefront-login-password"
              name="password"
              className="w-full px-4 py-3 pr-11 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-xyvoo-teal-product-hover focus:border-transparent"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                clearError();
                setPassword(e.target.value);
              }}
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
        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-2xl border-2 border-xyvoo-teal-product-hover bg-xyvoo-teal-product-hover py-3 font-semibold text-white transition-transform duration-300 ease-in-out hover:rotate-[5deg] hover:bg-white hover:text-xyvoo-teal-product-hover disabled:opacity-60 disabled:hover:rotate-0 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </motion.form>

      <motion.p
        className="text-center text-sm text-slate-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        Need a storefront?{" "}
        <Link className="font-medium text-slate-900 hover:underline" href="/register/storefront">
          Register your storefront
        </Link>
      </motion.p>
    </>
  );

  return (
    <WebsiteLayout>
      <div className="w-full bg-white">
        {/* Desktop: image sticks in view while the form scrolls past it, then the page continues into the CTA + footer */}
        <div className="hidden lg:grid lg:grid-cols-2 lg:pt-[76px]">
          <div className="lg:sticky lg:top-[76px] relative h-[calc(100vh-76px)] bg-white overflow-hidden">
            <Image
              src="/storefront-login.jpg"
              alt="Sign in to XYVOO Storefront"
              fill
              className="object-cover"
              sizes="50vw"
              priority
            />
          </div>

          <div className="flex justify-center p-12">
            <div className="w-full max-w-md space-y-6 pb-20">{form}</div>
          </div>
        </div>

        {/* Mobile: Form with image background */}
        <div className="lg:hidden flex flex-col relative overflow-hidden pt-[76px] pb-16">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <Image
              src="/storefront-login.jpg"
              alt=""
              fill
              className="object-cover opacity-10"
              sizes="100vw"
            />
          </div>

          <div className="flex items-center justify-center p-6 relative z-10">
            <div className="w-full max-w-sm space-y-6">{form}</div>
          </div>
        </div>
      </div>
    </WebsiteLayout>
  );
}
