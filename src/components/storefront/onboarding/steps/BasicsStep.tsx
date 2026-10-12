"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import { basicsSchema, CATEGORY_LABELS, homeCurrencyFor, isPaymentCountry, PAYMENT_CURRENCIES, STORE_COUNTRIES } from "@/lib/store/site/onboarding-steps";
import { ALL_COUNTRIES, flagUrl } from "@/lib/store/countries";
import CountryCombobox from "../CountryCombobox";
import { CURRENCY_NAMES, SHOP_CURRENCIES, type ShopCurrencyCode } from "@/lib/store/currencies";
import { STORE_CATEGORIES } from "@/lib/store/site/templates";
import { slugifyStoreName } from "@/lib/store/subdomain";
import StorefrontValidationModal, { type ValidationErrorItem } from "@/components/storefront/StorefrontValidationModal";
import type { StepProps, WizardInitial } from "../OnboardingWizard";
import { describedBy, ErrorBanner, Field, inputClass, StepActions } from "../fields";

type Availability = { state: "idle" | "checking" | "available" | "taken"; message: string };

const FIELD_LABELS: Record<string, string> = {
  storeName: "Store name",
  subdomain: "Web address",
  category: "Store category",
  categoryOther: "What you sell",
  countryCode: "Country",
  currencyCode: "Currency",
};

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
  const [modalErrors, setModalErrors] = useState<ValidationErrorItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [availability, setAvailability] = useState<Availability>({ state: "idle", message: "" });
  const [otherCountry, setOtherCountry] = useState(!isPaymentCountry(initial.countryCode));
  // The four countries we take payments in have their own cards above.
  const otherCountries = useMemo(() => ALL_COUNTRIES.filter((c) => !isPaymentCountry(c.code)), []);
  const serverError = (field: string) => (errorField === field ? errorMessage : undefined);
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const handleCloseModal = () => {
    setShowModal(false);
    if (modalErrors.length > 0) {
      const first = modalErrors[0]?.field;
      if (first) {
        document.getElementById(first === "countryCode" && otherCountry ? "basics-otherCountry" : `basics-${first}`)?.focus();
      }
    }
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
      const modalList: ValidationErrorItem[] = [];
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        next[key] ??= issue.message;
        modalList.push({
          field: key,
          label: FIELD_LABELS[key] || key,
          message: issue.message,
        });
      }
      setErrors(next);
      setModalErrors(modalList);
      setShowModal(true);
      return;
    }
    if (availability.state === "taken" && values.subdomain !== slug) {
      setErrors({ subdomain: availability.message });
      setModalErrors([{ field: "subdomain", label: "Web address", message: availability.message }]);
      setShowModal(true);
      return;
    }
    onSubmit(parsed.data);
  };

  const subdomainError = errors.subdomain || serverError("subdomain");
  const homeCurrency = homeCurrencyFor(values.countryCode, values.currencyCode);
  /** Sets the country and charging currency; the new home currency can't also be an extra one. */
  const chooseCountry = (countryCode: string, currencyCode: (typeof values)["currencyCode"]) => {
    const home = homeCurrencyFor(countryCode, currencyCode);
    set("countryCode", countryCode);
    set("currencyCode", currencyCode);
    set("extraCurrencies", values.extraCurrencies.filter((c) => c !== home));
  };
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

      <fieldset aria-describedby="basics-category-hint">
        <legend className="mb-1 text-sm font-medium text-slate-800">What do you sell?</legend>
        <p id="basics-category-hint" className="mb-2 text-sm text-slate-600">
          This helps us pick a template, words and phrases that suit your shop. You can change any of it later.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {STORE_CATEGORIES.map((c) => (
            <label
              key={c}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${values.category === c ? "border-xyvoo-teal-product-hover bg-emerald-50/50" : "border-slate-300"}`}
            >
              <input
                id={c === STORE_CATEGORIES[0] ? "basics-category" : undefined}
                type="radio"
                name="category"
                value={c}
                checked={values.category === c}
                onChange={() => set("category", c)}
                className="accent-xyvoo-teal-product-hover"
              />
              {CATEGORY_LABELS[c]}
            </label>
          ))}
        </div>
        {errors.category ? <p className="mt-1 text-sm text-red-700">{errors.category}</p> : null}
        {values.category === "other" ? (
          <div className="mt-4">
            <Field
              id="basics-categoryOther"
              label="Tell us what you sell"
              hint="For example: hand-made candles, car parts or school uniforms."
              error={errors.categoryOther || serverError("categoryOther")}
            >
              <input
                id="basics-categoryOther"
                className={inputClass}
                value={values.categoryOther}
                maxLength={80}
                onChange={(e) => set("categoryOther", e.target.value)}
                aria-invalid={Boolean(errors.categoryOther) || undefined}
                aria-describedby={describedBy("basics-categoryOther", { hint: true, error: errors.categoryOther || serverError("categoryOther") })}
              />
            </Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset aria-describedby="basics-countryCode-hint">
        <legend className="mb-1 text-sm font-medium text-slate-800">Where is your business based?</legend>
        <p id="basics-countryCode-hint" className="mb-2 text-sm text-slate-600">
          This sets the currency your customers pay in{otherCountry ? "." : `: ${CURRENCY_NAMES[homeCurrency]}.`}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {STORE_COUNTRIES.map((c, i) => (
            <label
              key={c.code}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${!otherCountry && values.countryCode === c.code ? "border-xyvoo-teal-product-hover bg-emerald-50/50" : "border-slate-300"}`}
            >
              <input
                id={i === 0 ? "basics-countryCode" : undefined}
                type="radio"
                name="country"
                value={c.code}
                checked={!otherCountry && values.countryCode === c.code}
                onChange={() => {
                  setOtherCountry(false);
                  chooseCountry(c.code, values.currencyCode);
                }}
                className="accent-xyvoo-teal-product-hover"
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny local SVG */}
              <img src={flagUrl(c.code)} alt="" width={24} height={16} className="h-4 w-6 shrink-0 rounded-sm object-cover ring-1 ring-slate-200" />
              {c.name}
            </label>
          ))}
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${otherCountry ? "border-xyvoo-teal-product-hover bg-emerald-50/50" : "border-slate-300"}`}
          >
            <input
              type="radio"
              name="country"
              value="other"
              checked={otherCountry}
              onChange={() => {
                setOtherCountry(true);
                set("countryCode", "");
              }}
              className="accent-xyvoo-teal-product-hover"
            />
            <Globe className="h-4 w-6 shrink-0 text-slate-500" aria-hidden />
            Somewhere else
          </label>
        </div>
        {errors.countryCode && !otherCountry ? <p className="mt-1 text-sm text-red-700">{errors.countryCode}</p> : null}

        {otherCountry ? (
          <div className="mt-4 space-y-4">
            <Field id="basics-otherCountry" label="Your country" error={errors.countryCode}>
              <CountryCombobox
                id="basics-otherCountry"
                countries={otherCountries}
                value={values.countryCode}
                onChange={(code) => chooseCountry(code, values.currencyCode)}
                invalid={Boolean(errors.countryCode)}
                describedBy={describedBy("basics-otherCountry", { error: errors.countryCode })}
              />
            </Field>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-slate-800">
                For now, shops on XYVOO take payments in US dollars, Nigerian naira, Ghanaian cedi, Kenyan shillings or South African rand. Choose the one
                your shop will charge in. To be paid, you&rsquo;ll need a bank account in that currency.
              </p>
              <fieldset className="mt-3">
                <legend className="sr-only">Currency your shop charges in</legend>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_CURRENCIES.map((code) => (
                    <label
                      key={code}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border bg-white px-4 text-sm ${values.currencyCode === code ? "border-xyvoo-teal-product-hover font-medium text-slate-900" : "border-slate-300 text-slate-700"}`}
                    >
                      <input
                        type="radio"
                        name="currencyCode"
                        value={code}
                        checked={values.currencyCode === code}
                        onChange={() => chooseCountry(values.countryCode, code)}
                        className="accent-xyvoo-teal-product-hover"
                      />
                      {code} <span className="text-slate-500">· {CURRENCY_NAMES[code]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset aria-describedby="basics-extraCurrencies-hint">
        <legend className="mb-1 text-sm font-medium text-slate-800">
          Also show prices in <span className="font-normal text-slate-500">(optional)</span>
        </legend>
        <p id="basics-extraCurrencies-hint" className="mb-2 text-sm text-slate-600">
          Customers can switch currency in your shop. They still pay in {homeCurrency}. You can set exchange rates and your own prices later in Payments. Other
          currencies show in your shop on the Standard plan; on Free, we keep your choice for when you upgrade.
        </p>
        <div className="flex flex-wrap gap-2">
          {SHOP_CURRENCIES.filter((c) => c !== homeCurrency).map((code) => {
            const on = values.extraCurrencies.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() => set("extraCurrencies", on ? values.extraCurrencies.filter((c) => c !== code) : [...values.extraCurrencies, code])}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium ${on ? "border-xyvoo-teal-product-hover bg-emerald-50/50 text-slate-900" : "border-slate-300 text-slate-700 hover:border-slate-400"}`}
              >
                {code} <span className="font-normal text-slate-500">· {CURRENCY_NAMES[code as ShopCurrencyCode]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <StepActions busy={busy} backHref={backHref} />

      <StorefrontValidationModal
        isOpen={showModal}
        onClose={handleCloseModal}
        errors={modalErrors}
        title="Incomplete Store Details"
        description="Please review and complete the following fields before continuing:"
        confirmText="Okay, I will complete them"
      />
    </form>
  );
}
