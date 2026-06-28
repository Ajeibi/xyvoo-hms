"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { supabaseAuthBrowser } from "@/lib/supabase/auth-browser";
import { formatSignInError } from "@/lib/auth-errors";
import { toastError, toastSuccess } from "@/lib/app-toast";

export default function LoginPage() {
  const router = useRouter();
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
    const { error: signInError } = await supabaseAuthBrowser.auth.signInWithPassword({ email, password });
    setLoading(false);
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
    router.replace(redirectData.redirectTo || "/register");
    router.refresh();
  };

  return (
    <WebsiteLayout compactMain>
      <div className="bg-slate-50 px-4 pb-28 pt-28">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-500">Use the hotel owner account created during registration.</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl"
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => {
                clearError();
                setEmail(e.target.value);
              }}
              required
            />
            <div className="relative">
              <input
                className="w-full px-4 py-3 pr-11 text-sm bg-white border border-slate-200 rounded-xl"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
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
            {error ? (
              <div
                role="alert"
                aria-live="polite"
                className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
                <p>{error}</p>
              </div>
            ) : null}
            <button
              disabled={loading}
              className="w-full rounded-xl bg-xyvoo-blue py-3 font-semibold text-white disabled:opacity-60"
              type="submit"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="text-sm text-slate-500">
            Need an account? <Link className="text-blue-600" href="/register">Register your hotel</Link>
          </p>
        </div>
      </div>
    </WebsiteLayout>
  );
}
