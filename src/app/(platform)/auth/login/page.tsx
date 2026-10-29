"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { supabaseAuthBrowser } from "@/lib/supabase/auth-browser";
import { formatSignInError } from "@/lib/auth-errors";
import { toastError, toastSuccess } from "@/lib/app-toast";
import HotelAuthLayout from "@/features/hotel-register/components/HotelAuthLayout";
import RegisterHighlights from "@/features/hotel-register/components/RegisterHighlights";

const SIGN_IN_QUOTE = ["Welcome back. Everything your team did while you were away is right where it should be."];
import { INPUT_CLASS } from "@/features/hotel-register/constants";
import { LINK_CLASS, PRIMARY_BUTTON_CLASS } from "@/features/hotel-register/components/fields";

export default function LoginPage() {
  const [from] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("from") || "";
  });

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
        const { title, message } = formatSignInError(signInError);
        setError(message);
        toastError(title, message);
        return;
      }
      const redirectRes = await fetch("/api/auth/post-login-redirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from }),
      });
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
      await new Promise((resolve) => setTimeout(resolve, 700));
      // Hard navigation, not router.replace/refresh: the destination is almost
      // always the same middleware-guarded route the user was just bounced
      // from (e.g. a department home path). A soft client-side transition can
      // reach the middleware's auth check before the just-set session cookies
      // are guaranteed visible to it, which redirects straight back to
      // /auth/login?from=... — a full page load always carries the fresh
      // cookies and never reuses a cached response for that path.
      window.location.assign(redirectData.redirectTo || "/register");
    } catch {
      const message = "We couldn't reach the sign-in service. Check your internet connection and try again.";
      setError(message);
      toastError("Connection problem", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <HotelAuthLayout imageAlt="A receptionist welcoming guests at a hotel front desk" aside={<RegisterHighlights quotes={SIGN_IN_QUOTE} />}>
      <motion.div
        className="space-y-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="text-sm font-bold uppercase tracking-wider text-xyvoo-blue-deep">XYVOO Hotel</p>
        <h1 className="text-4xl font-bold leading-tight text-black">Sign in</h1>
        <motion.p
          className="text-base leading-relaxed text-black"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Use the hotel owner account created during registration.
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
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-black">
            Email address
          </label>
          <input
            id="login-email"
            name="email"
            className={INPUT_CLASS}
            type="email"
            placeholder="you@yourhotel.com"
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
          <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-black">
            Password
          </label>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              className={`${INPUT_CLASS} pr-12`}
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
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-right text-sm">
            <Link href="/auth/forgot-password?for=hms" className="font-medium text-black hover:underline">
              Forgot your password?
            </Link>
          </p>
        </div>
        <button disabled={loading} type="submit" className={PRIMARY_BUTTON_CLASS}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </motion.form>

      <motion.p
        className="text-center text-sm font-medium text-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        Need an account?{" "}
        <Link className={LINK_CLASS} href="/register">
          Register your hotel
        </Link>
      </motion.p>
    </HotelAuthLayout>
  );
}
