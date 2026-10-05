"use client";

import { useState } from "react";
import { essentialsSchema } from "@/lib/store/site/onboarding-steps";
import type { StepProps, WizardInitial } from "../OnboardingWizard";
import { describedBy, ErrorBanner, Field, inputClass, StepActions } from "../fields";

type Values = WizardInitial["essentials"];
type TextKey = Exclude<keyof Values, "deliveryFee" | "freeDeliveryOver" | "offersPickup">;

export default function EssentialsStep({ initial, busy, errorField, errorMessage, backHref, onSubmit }: StepProps<Values>) {
  const [values, setValues] = useState(initial);
  const [deliveryFee, setDeliveryFee] = useState(String(initial.deliveryFee));
  const [freeOn, setFreeOn] = useState(initial.freeDeliveryOver !== null);
  const [freeOver, setFreeOver] = useState(initial.freeDeliveryOver !== null ? String(initial.freeDeliveryOver) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const errorFor = (key: string) => errors[key] || (errorField === key ? errorMessage : undefined);

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

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = essentialsSchema.safeParse({
      ...values,
      deliveryFee: deliveryFee === "" ? 0 : deliveryFee,
      freeDeliveryOver: freeOn ? freeOver : null,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      document.getElementById(`essentials-${Object.keys(next)[0]}`)?.focus();
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
          {text("phone", "Phone number", { type: "tel", autoComplete: "tel", inputMode: "tel" })}
          {text("whatsapp", "WhatsApp number", { type: "tel", inputMode: "tel", optional: true })}
        </div>
        {text("addressLine1", "Street address", { autoComplete: "address-line1" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {text("city", "Town or city", { autoComplete: "address-level2" })}
          {text("state", "State or region", { autoComplete: "address-level1" })}
        </div>
      </section>

      <section aria-labelledby="essentials-delivery" className="space-y-4">
        <h2 id="essentials-delivery" className="text-base font-semibold text-slate-900">
          Delivery
        </h2>
        <p className="text-sm text-slate-600">A single delivery charge to start with. You can set different prices for different areas from your dashboard later.</p>
        <Field id="essentials-deliveryFee" label="Delivery charge per order" hint="Enter 0 if delivery is always free." error={errorFor("deliveryFee")}>
          <input
            id="essentials-deliveryFee"
            className={inputClass}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(e.target.value)}
            aria-describedby={describedBy("essentials-deliveryFee", { hint: true, error: errorFor("deliveryFee") })}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input type="checkbox" checked={freeOn} onChange={(e) => setFreeOn(e.target.checked)} className="mt-0.5 h-4 w-4 accent-xyvoo-teal-product-hover" />
          Offer free delivery on larger orders
        </label>
        {freeOn ? (
          <Field id="essentials-freeDeliveryOver" label="Free delivery on orders over" error={errorFor("freeDeliveryOver")}>
            <input
              id="essentials-freeDeliveryOver"
              className={inputClass}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={freeOver}
              onChange={(e) => setFreeOver(e.target.value)}
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
        <p className="text-sm text-slate-600">Full links to your pages. They appear as icons in your shop&rsquo;s footer.</p>
        {text("instagram", "Instagram", { type: "url", inputMode: "url", placeholder: "https://instagram.com/yourstore", optional: true })}
        {text("facebook", "Facebook", { type: "url", inputMode: "url", placeholder: "https://facebook.com/yourstore", optional: true })}
        {text("tiktok", "TikTok", { type: "url", inputMode: "url", placeholder: "https://tiktok.com/@yourstore", optional: true })}
      </section>

      <StepActions busy={busy} backHref={backHref} />
    </form>
  );
}
