"use client";

import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { supabaseAuthBrowser } from "@/lib/supabase/auth-browser";
import { toastError, toastSuccess } from "@/lib/app-toast";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export default function StorefrontCompleteRegistrationPage() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabaseAuthBrowser.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.assign("/auth/login/storefront");
        return;
      }
      setCheckingSession(false);
    });
  }, []);

  const clearError = () => {
    if (error) setError("");
  };

  const handleStoreNameChange = (value: string) => {
    setStoreName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/store/register/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName, slug }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          typeof data.error === "string" ? data.error : "Failed to finish setting up your storefront.";
        setError(message);
        toastError("Setup failed", message);
        return;
      }

      toastSuccess("Storefront ready", "Opening your dashboard…");
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.location.assign(data.redirectTo || `/storefront/${data.slug}/dashboard`);
    } catch {
      const message = "We couldn't reach the registration service. Check your internet connection and try again.";
      setError(message);
      toastError("Connection problem", message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <WebsiteLayout>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Loading…</div>
      </WebsiteLayout>
    );
  }

  return (
    <WebsiteLayout>
      <div className="flex justify-center px-6 py-24">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-xyvoo-teal-product-hover">
              XYVOO Storefront
            </p>
            <h1 className="text-4xl font-bold text-slate-900 leading-tight">Name your storefront</h1>
            <p className="text-base text-slate-600 leading-relaxed">
              You&apos;re signed in with Google. Just pick a store name and address to finish setting up.
            </p>
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="complete-store-name" className="mb-1 block text-xs font-medium text-slate-600">
                Store name
              </label>
              <input
                id="complete-store-name"
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
              <label htmlFor="complete-store-slug" className="mb-1 block text-xs font-medium text-slate-600">
                Storefront URL
              </label>
              <div className="flex items-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus-within:ring-2 focus-within:ring-xyvoo-teal-product-hover">
                <span className="text-slate-400">getxyvoo.com/storefront/</span>
                <input
                  id="complete-store-slug"
                  name="slug"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  placeholder="your-store"
                  value={slug}
                  onChange={(e) => {
                    clearError();
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  required
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Lowercase letters, numbers, and hyphens only. This becomes your dashboard address.
              </p>
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-2xl border-2 border-xyvoo-teal-product-hover bg-xyvoo-teal-product-hover py-3 font-semibold text-white transition-transform duration-300 ease-in-out hover:rotate-[5deg] hover:bg-white hover:text-xyvoo-teal-product-hover disabled:opacity-60 disabled:hover:rotate-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? "Setting up..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </WebsiteLayout>
  );
}
