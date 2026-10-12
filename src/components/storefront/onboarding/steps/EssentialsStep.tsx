"use client";

import { useState } from "react";
import { currencySymbol } from "@/lib/shop/format";
import { essentialsSchema } from "@/lib/store/site/onboarding-steps";
import { countryName } from "@/lib/store/countries";
import { COUNTRY_REGIONS, regionLabel } from "@/lib/store/regions";
import PlaceSearch from "../PlaceSearch";
import SocialLinksField from "../SocialLinksField";
import PhoneField, { toInternational } from "../PhoneField";
import { isValidPhoneNumber } from "react-phone-number-input";
import StorefrontValidationModal, { type ValidationErrorItem } from "@/components/storefront/StorefrontValidationModal";
import type { StepProps, WizardInitial } from "../OnboardingWizard";
import { describedBy, ErrorBanner, Field, inputClass, StepActions } from "../fields";

type Values = WizardInitial["essentials"];
type TextKey = Exclude<keyof Values, "deliveryFee" | "freeDeliveryOver" | "offersPickup" | "socialLinks">;

const FIELD_LABELS: Record<string, string> = {
  businessEmail: "Business email",
  phone: "Phone number",
  whatsapp: "WhatsApp number",
  addressLine1: "Street address",
  city: "Town or city",
  state: "State or region",
  postalCode: "Postal code",
  deliveryFee: "Delivery fee",
  freeDeliveryOver: "Free delivery threshold",
};

/**
 * Keeps a money field to a plain amount: digits and one decimal point, two
 * decimal places, no leading zeros ("01" becomes "1"; "0.5" stays).
 */
function cleanMoney(text: string) {
  const [whole = "", ...rest] = text.replace(/[^0-9.]/g, "").split(".");
  const intPart = whole.replace(/^0+(?=\d)/, "");
  return rest.length ? `${intPart || "0"}.${rest.join("").slice(0, 2)}` : intPart;
}


/** An amount box with the currency symbol in front, e.g. ₦. */
function MoneyInput({ currency, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { currency: string }) {
  const symbol = currencySymbol(currency);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-600" aria-hidden>
        {symbol}
      </span>
      <input {...props} className={inputClass} type="text" inputMode="decimal" style={{ paddingLeft: `${1 + symbol.length * 0.6 + 0.5}rem` }} />
    </div>
  );
}

export default function EssentialsStep({
  initial,
  busy,
  errorField,
  errorMessage,
  backHref,
  onSubmit,
  countryCode,
  homeCurrency,
}: StepProps<Values> & { countryCode: string; homeCurrency: string }) {
  const regions = COUNTRY_REGIONS[countryCode]?.regions ?? null;
  const [values, setValues] = useState(() => ({
    ...initial,
    phone: toInternational(initial.phone, countryCode),
    whatsapp: toInternational(initial.whatsapp, countryCode),
  }));
  // Ticked when the saved WhatsApp number is the phone number, so it isn't typed twice.
  const [sameWhatsapp, setSameWhatsapp] = useState(
    () => Boolean(initial.phone) && toInternational(initial.whatsapp, countryCode) === toInternational(initial.phone, countryCode),
  );
  const [deliveryFee, setDeliveryFee] = useState(String(initial.deliveryFee));
  const [freeOn, setFreeOn] = useState(initial.freeDeliveryOver !== null);
  const [freeOver, setFreeOver] = useState(initial.freeDeliveryOver !== null ? String(initial.freeDeliveryOver) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [modalErrors, setModalErrors] = useState<ValidationErrorItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const errorFor = (key: string) => errors[key] || (errorField === key ? errorMessage : undefined);

  const handleCloseModal = () => {
    setShowModal(false);
    if (modalErrors.length > 0) {
      const first = modalErrors[0]?.field;
      if (first) {
        document.getElementById(`essentials-${first}`)?.focus();
      }
    }
  };

  const text = (key: TextKey, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string; optional?: boolean } = {}) => {
    const { hint, optional, ...inputProps } = props;
    const id = `essentials-${key}`;
    return (
      <Field id={id} label={label} hint={hint} optional={optional} error={errorFor(key)}>
        <input
          id={id}
          className={inputClass}
          value={values[key]}
          onChange={(e) => {
            setValues((v) => ({ ...v, [key]: e.target.value }));
            setErrors((er) => ({ ...er, [key]: "" }));
          }}
          aria-invalid={Boolean(errorFor(key)) || undefined}
          aria-describedby={describedBy(id, { hint: Boolean(hint), error: errorFor(key) })}
          {...inputProps}
        />
      </Field>
    );
  };

  const phone = (key: "phone" | "whatsapp", label: string, optional = false) => {
    const id = `essentials-${key}`;
    return (
      <Field id={id} label={label} optional={optional} error={errorFor(key)}>
        <PhoneField
          id={id}
          countryCode={countryCode}
          value={values[key]}
          onChange={(v) => {
            setValues((s) => ({ ...s, [key]: v }));
            setErrors((er) => ({ ...er, [key]: "" }));
          }}
          invalid={Boolean(errorFor(key))}
          describedBy={describedBy(id, { error: errorFor(key) })}
        />
      </Field>
    );
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // The schema checks there are enough digits; this checks the number is real for its country.
    const badPhone: Record<string, string> = {};
    if (values.phone && !isValidPhoneNumber(values.phone)) badPhone.phone = "Enter a valid phone number, including the right country.";
    if (!sameWhatsapp && values.whatsapp && !isValidPhoneNumber(values.whatsapp)) badPhone.whatsapp = "Enter a valid WhatsApp number, or leave it blank.";
    if (Object.keys(badPhone).length) {
      setErrors(badPhone);
      setModalErrors(Object.entries(badPhone).map(([field, message]) => ({ field, label: FIELD_LABELS[field], message })));
      setShowModal(true);
      return;
    }
    const parsed = essentialsSchema.safeParse({
      ...values,
      whatsapp: sameWhatsapp ? values.phone : values.whatsapp,
      deliveryFee: deliveryFee === "" ? 0 : deliveryFee,
      freeDeliveryOver: freeOn ? freeOver : null,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      const modalList: ValidationErrorItem[] = [];
      for (const issue of parsed.error.issues) {
        // A bad social link is marked on its own row (essentials-social-<n>).
        const key = issue.path[0] === "socialLinks" && typeof issue.path[1] === "number" ? `social-${issue.path[1]}` : String(issue.path[0]);
        next[key] ??= issue.message;
        modalList.push({
          field: key,
          label: key.startsWith("social-") ? "Social media link" : FIELD_LABELS[key] || key,
          message: issue.message,
        });
      }
      setErrors(next);
      setModalErrors(modalList);
      setShowModal(true);
      return;
    }
    onSubmit(parsed.data);
  };

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      {Object.values(errors).some(Boolean) || (errorField && errorMessage) ? <ErrorBanner message="Please check the highlighted fields." /> : null}

      <section aria-labelledby="essentials-contact" className="space-y-4">
        <h2 id="essentials-contact" className="text-base font-semibold text-slate-900">
          How customers can reach you
        </h2>
        <p className="text-sm text-slate-600">Shown on your shop&rsquo;s contact details and order emails.</p>
        {text("businessEmail", "Business email", { type: "email", autoComplete: "email", inputMode: "email" })}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            {phone("phone", "Phone number")}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={sameWhatsapp}
                onChange={(e) => {
                  setSameWhatsapp(e.target.checked);
                  setErrors((er) => ({ ...er, whatsapp: "" }));
                }}
                className="h-4 w-4 accent-xyvoo-teal-product-hover"
              />
              Use this number for WhatsApp too
            </label>
          </div>
          {sameWhatsapp ? null : phone("whatsapp", "WhatsApp number", true)}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800">Country</p>
          <p className="mt-1 text-sm text-slate-600">
            {countryName(countryCode)} <span className="text-slate-500">(from Store basics)</span>
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="essentials-state" label={regionLabel(countryCode)} error={errorFor("state")}>
            {regions ? (
              <select
                id="essentials-state"
                className={inputClass}
                value={values.state}
                onChange={(e) => {
                  const state = e.target.value;
                  setValues((v) => ({ ...v, state, city: "" }));
                  setErrors((er) => ({ ...er, state: "" }));
                }}
                aria-invalid={Boolean(errorFor("state")) || undefined}
                aria-describedby={describedBy("essentials-state", { error: errorFor("state") })}
              >
                <option value="">Choose your {regionLabel(countryCode).toLowerCase()}</option>
                {/* Keep a value saved before the list existed, so it isn't silently lost. */}
                {values.state && !regions.includes(values.state) ? <option value={values.state}>{values.state}</option> : null}
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <PlaceSearch
                id="essentials-state"
                kind="state"
                country={countryCode}
                value={values.state}
                onChange={(state) => {
                  setValues((v) => ({ ...v, state, city: state === v.state ? v.city : "" }));
                  setErrors((er) => ({ ...er, state: "" }));
                }}
                invalid={Boolean(errorFor("state"))}
                describedBy={describedBy("essentials-state", { error: errorFor("state") })}
              />
            )}
          </Field>
          <Field id="essentials-city" label="Town or city" error={errorFor("city")}>
            {values.state ? (
              <PlaceSearch
                key={values.state}
                id="essentials-city"
                kind="city"
                country={countryCode}
                state={values.state}
                value={values.city}
                placeholder="e.g. Ikeja"
                onChange={(city) => {
                  setValues((v) => ({ ...v, city }));
                  setErrors((er) => ({ ...er, city: "" }));
                }}
                invalid={Boolean(errorFor("city"))}
                describedBy={describedBy("essentials-city", { error: errorFor("city") })}
              />
            ) : (
              <input id="essentials-city" className={inputClass} disabled placeholder={`Choose your ${regionLabel(countryCode).toLowerCase()} first`} />
            )}
          </Field>
        </div>
        {text("addressLine1", "Street address", { autoComplete: "address-line1", placeholder: "e.g. 12 Allen Avenue" })}
      </section>

      <section aria-labelledby="essentials-delivery" className="space-y-4">
        <h2 id="essentials-delivery" className="text-base font-semibold text-slate-900">
          Delivery
        </h2>
        <p className="text-sm text-slate-600">
          Your standard delivery charge. Later, from your dashboard, you can set different charges for different areas, add free delivery rules, and add an extra charge to
          bulky products.
</p>
        <Field id="essentials-deliveryFee" label={`Delivery charge per order (${homeCurrency})`} hint="Enter 0 if delivery is always free." error={errorFor("deliveryFee")}>
          <MoneyInput
            id="essentials-deliveryFee"
            currency={homeCurrency}
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(cleanMoney(e.target.value))}
            aria-describedby={describedBy("essentials-deliveryFee", { hint: true, error: errorFor("deliveryFee") })}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input type="checkbox" checked={freeOn} onChange={(e) => setFreeOn(e.target.checked)} className="mt-0.5 h-4 w-4 accent-xyvoo-teal-product-hover" />
          Offer free delivery on larger orders
        </label>
        {freeOn ? (
          <Field id="essentials-freeDeliveryOver" label={`Free delivery on orders over (${homeCurrency})`} error={errorFor("freeDeliveryOver")}>
            <MoneyInput
              id="essentials-freeDeliveryOver"
              currency={homeCurrency}
              value={freeOver}
              onChange={(e) => setFreeOver(cleanMoney(e.target.value))}
              aria-describedby={describedBy("essentials-freeDeliveryOver", { error: errorFor("freeDeliveryOver") })}
            />
          </Field>
        ) : null}
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={values.offersPickup}
            onChange={(e) => setValues((v) => ({ ...v, offersPickup: e.target.checked }))}
            className="mt-0.5 h-4 w-4 accent-xyvoo-teal-product-hover"
          />
          Customers can also collect their order in person, free of charge
        </label>
      </section>

      <section aria-labelledby="essentials-social" className="space-y-4">
        <h2 id="essentials-social" className="text-base font-semibold text-slate-900">
          Social media <span className="text-sm font-normal text-slate-500">(optional)</span>
        </h2>
        <p className="text-sm text-slate-600">
          Paste a link to each of your pages, on any platform. We&rsquo;ll recognise Instagram, TikTok, Facebook, X, YouTube and others, and show them as
          icons in your shop&rsquo;s footer.
        </p>
        <SocialLinksField
          idPrefix="essentials-social"
          links={values.socialLinks}
          onChange={(socialLinks) => {
            setValues((v) => ({ ...v, socialLinks }));
            setErrors((er) => Object.fromEntries(Object.entries(er).filter(([k]) => !k.startsWith("social-"))));
          }}
          inputClassName={inputClass}
          errors={Object.fromEntries(Object.entries(errors).filter(([k, m]) => k.startsWith("social-") && m).map(([k, m]) => [Number(k.slice(7)), m]))}
        />
      </section>

      <StepActions busy={busy} backHref={backHref} />

      <StorefrontValidationModal
        isOpen={showModal}
        onClose={handleCloseModal}
        errors={modalErrors}
        title="Incomplete Essentials Details"
        description="Please review and complete the following fields before continuing:"
        confirmText="Okay, I will complete them"
      />
    </form>
  );
}
