"use client";

import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { SubdomainInput } from "@/components/forms/SubdomainInput";
import StorefrontValidationModal, { type ValidationErrorItem } from "@/components/storefront/StorefrontValidationModal";
import { supabaseAuthBrowser } from "@/lib/supabase/auth-browser";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { slugifyStoreName as slugify, storeSubdomainSchema } from "@/lib/store/subdomain";
import { readSignupIntent } from "@/lib/store/site/signup-intent";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  storeName: "Store name",
  slug: "Storefront URL",
};

export default function StorefrontCompleteRegistrationPage() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationModalErrors, setValidationModalErrors] = useState<ValidationErrorItem[]>([]);
  const [showValidationModal, setShowValidationModal] = useState(false);

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

  const clearFieldError = (fieldKey: string) => {
    if (fieldErrors[fieldKey]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
    if (error) setError("");
  };

  const handleCloseModal = () => {
    setShowValidationModal(false);
    if (validationModalErrors.length > 0) {
      const first = validationModalErrors[0]?.field;
      if (first === "storeName") {
        document.getElementById("complete-store-name")?.focus();
      } else if (first === "slug") {
        document.getElementById("complete-store-slug")?.focus();
      }
    }
  };

  const handleStoreNameChange = (value: string) => {
    setStoreName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const nextErrors: Record<string, string> = {};
    const modalItems: ValidationErrorItem[] = [];

    if (!storeName.trim()) {
      nextErrors.storeName = "Please enter your store name.";
      modalItems.push({ field: "storeName", label: "Store name", message: "Please enter your store name." });
    } else if (storeName.trim().length < 2) {
      nextErrors.storeName = "Store name must be at least 2 characters.";
      modalItems.push({ field: "storeName", label: "Store name", message: "Store name must be at least 2 characters." });
    }

    if (!slug.trim()) {
      nextErrors.slug = "Please enter your storefront web address.";
      modalItems.push({ field: "slug", label: "Storefront URL", message: "Please enter your storefront web address." });
    } else {
      const slugValidation = storeSubdomainSchema.safeParse(slug);
      if (!slugValidation.success) {
        const msg = slugValidation.error.issues[0]?.message || "Invalid web address.";
        nextErrors.slug = msg;
        modalItems.push({ field: "slug", label: "Storefront URL", message: msg });
      }
    }

    if (modalItems.length > 0) {
      setFieldErrors(nextErrors);
      setValidationModalErrors(modalItems);
      setShowValidationModal(true);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/store/register/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName, slug, ...readSignupIntent(window.location.search) }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          typeof data.error === "string" ? data.error : "Failed to finish setting up your storefront.";
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          const map: Record<string, string> = {};
          const list: ValidationErrorItem[] = [];
          for (const item of data.errors) {
            map[item.field] = item.message;
            list.push({
              field: item.field,
              label: FIELD_LABELS[item.field] || item.field,
              message: item.message,
            });
          }
          setFieldErrors(map);
          setValidationModalErrors(list);
          setShowValidationModal(true);
        } else {
          setError(message);
          toastError("Setup failed", message);
        }
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

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="complete-store-name" className={cn("mb-1 block text-xs font-medium", fieldErrors.storeName ? "text-rose-700" : "text-slate-600")}>
                Store name
              </label>
              <input
                id="complete-store-name"
                name="storeName"
                className={cn(
                  "w-full px-4 py-3 text-sm bg-white border rounded-xl focus:outline-none focus:ring-2 transition-colors",
                  fieldErrors.storeName
                    ? "border-rose-500 focus:ring-rose-400 bg-rose-50/20"
                    : "border-slate-200 focus:ring-xyvoo-teal-product-hover focus:border-transparent",
                )}
                placeholder="e.g. Kaine & Co"
                autoComplete="organization"
                value={storeName}
                onChange={(e) => {
                  clearFieldError("storeName");
                  handleStoreNameChange(e.target.value);
                }}
              />
              {fieldErrors.storeName ? (
                <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.storeName}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="complete-store-slug" className={cn("mb-1 block text-xs font-medium", fieldErrors.slug ? "text-rose-700" : "text-slate-600")}>
                Storefront URL
              </label>
              <SubdomainInput
                id="complete-store-slug"
                name="slug"
                placeholder="your-store"
                value={slug}
                hasError={Boolean(fieldErrors.slug)}
                onChange={(e) => {
                  clearFieldError("slug");
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                ringClassName="focus-within:ring-xyvoo-teal-product-hover"
              />
              {fieldErrors.slug ? (
                <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.slug}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">
                  Lowercase letters, numbers, and hyphens only. This becomes your shop&rsquo;s web address. You can switch to your own custom domain later.
                </p>
              )}
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-2xl border-2 border-xyvoo-teal-product-hover bg-xyvoo-teal-product-hover py-3 font-semibold text-white transition-transform duration-300 ease-in-out hover:rotate-[5deg] hover:bg-white hover:text-xyvoo-teal-product-hover disabled:opacity-60 disabled:hover:rotate-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? "Setting up..." : "Continue"}
            </button>
          </form>

          <StorefrontValidationModal
            isOpen={showValidationModal}
            onClose={handleCloseModal}
            errors={validationModalErrors}
            title="Incomplete Store Details"
            description="Please review and complete the following fields before continuing:"
            confirmText="Okay, I will complete them"
          />
        </div>
      </div>
    </WebsiteLayout>
  );
}
