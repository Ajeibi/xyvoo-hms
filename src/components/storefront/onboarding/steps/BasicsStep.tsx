"use client";

import { useEffect, useState } from "react";
import { basicsSchema, CATEGORY_LABELS, STORE_COUNTRIES } from "@/lib/store/site/onboarding-steps";
import { STORE_CATEGORIES } from "@/lib/store/site/templates";
import { slugifyStoreName } from "@/lib/store/subdomain";
import type { StepProps, WizardInitial } from "../OnboardingWizard";
import { describedBy, ErrorBanner, Field, inputClass, StepActions } from "../fields";

type Availability = { state: "idle" | "checking" | "available" | "taken"; message: string };

export default function BasicsStep({
  slug,
  initial,
  busy,
  errorField,
  errorMessage,
  backHref,
  onSubmit,
  rootDomain,
}: StepProps<WizardInitial["basics"]> & { rootDomain: string }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [availability, setAvailability] = useState<Availability>({ state: "idle", message: "" });
  const serverError = (field: string) => (errorField === field ? errorMessage : undefined);
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  // Check the web address shortly after the merchant stops typing.
  useEffect(() => {
    if (values.subdomain === slug) return;
    const candidate = values.subdomain;
    const timer = window.setTimeout(async () => {
      setAvailability({ state: "checking", message: "Checking…" });
      try {
        const res = await fetch(`/api/store/subdomain-check?slug=${encodeURIComponent(slug)}&candidate=${encodeURIComponent(candidate)}`);
        const data = await res.json();
        setAvailability(data.available ? { state: "available", message: "That address is free." } : { state: "taken", message: data.reason || "That address isn't available." });
      } catch {
        setAvailability({ state: "idle", message: "" });
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [values.subdomain, slug]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = basicsSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      document.getElementById(`basics-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    if (availability.state === "taken" && values.subdomain !== slug) {
      setErrors({ subdomain: availability.message });
      document.getElementById("basics-subdomain")?.focus();
      return;
    }
    onSubmit(parsed.data);
  };

  const subdomainError = errors.subdomain || serverError("subdomain");
  const availabilityShown = values.subdomain !== slug && !subdomainError ? availability : { state: "idle" as const, message: "" };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {Object.values(errors).some(Boolean) ? <ErrorBanner message="Please check the highlighted fields." /> : null}

      <Field id="basics-storeName" label="Store name" error={errors.storeName || serverError("storeName")}>
        <input
          id="basics-storeName"
          className={inputClass}
          value={values.storeName}
          onChange={(e) => set("storeName", e.target.value)}
          autoComplete="organization"
          aria-invalid={Boolean(errors.storeName) || undefined}
          aria-describedby={describedBy("basics-storeName", { error: errors.storeName })}
        />
      </Field>

      <Field id="basics-subdomain" label="Web address" hint="Lowercase letters, numbers and hyphens. Changing it later breaks old links." error={subdomainError}>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-xyvoo-teal-product-hover">
          <input
            id="basics-subdomain"
            className="min-w-0 flex-1 px-4 py-3 text-sm text-slate-900 focus:outline-none"
            value={values.subdomain}
            onChange={(e) => set("subdomain", slugifyStoreName(e.target.value))}
            aria-invalid={Boolean(subdomainError) || undefined}
            aria-describedby={describedBy("basics-subdomain", { hint: true, error: subdomainError }) + " basics-subdomain-status"}
            spellCheck={false}
          />
          <span className="flex items-center border-l border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">.{rootDomain}</span>
        </div>
        <p id="basics-subdomain-status" role="status" className={`mt-1 text-sm ${availabilityShown.state === "taken" ? "text-red-700" : "text-emerald-700"}`}>
          {availabilityShown.message}
        </p>
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-800">What do you sell?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {STORE_CATEGORIES.map((c) => (
            <label
              key={c}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${values.category === c ? "border-xyvoo-teal-product-hover bg-emerald-50/50" : "border-slate-300"}`}
            >
              <input type="radio" name="category" value={c} checked={values.category === c} onChange={() => set("category", c)} className="accent-xyvoo-teal-product-hover" />
              {CATEGORY_LABELS[c]}
            </label>
          ))}
        </div>
        {errors.category ? <p className="mt-1 text-sm text-red-700">{errors.category}</p> : null}
      </fieldset>

      <Field id="basics-countryCode" label="Country" hint="Sets the currency your prices are shown in." error={errors.countryCode}>
        <select
          id="basics-countryCode"
          className={inputClass}
          value={values.countryCode}
          onChange={(e) => set("countryCode", e.target.value)}
          aria-describedby={describedBy("basics-countryCode", { hint: true, error: errors.countryCode })}
        >
          {STORE_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.currency})
            </option>
          ))}
        </select>
      </Field>

      <StepActions busy={busy} backHref={backHref} />
    </form>
  );
}
