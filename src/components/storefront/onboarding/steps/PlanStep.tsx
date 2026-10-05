"use client";

import { useState } from "react";
import { Check, Info } from "lucide-react";
import { STOREFRONT_PLANS } from "@/constants/pricing";
import { planSchema } from "@/lib/store/site/onboarding-steps";
import type { StorePlan } from "@/lib/store/site/onboarding";
import type { StepProps, WizardInitial } from "../OnboardingWizard";
import { describedBy, ErrorBanner, Field, inputClass, StepActions } from "../fields";

const PLAN_IDS: Record<string, StorePlan> = { Free: "free", Standard: "standard", Enterprise: "enterprise" };
const naira = (display: string) => display.replace(/^N(?=\d)/, "₦");

export default function PlanStep({ initial, busy, errorField, errorMessage, backHref, onSubmit }: StepProps<WizardInitial["plan"]>) {
  const [plan, setPlan] = useState<StorePlan>(initial.plan);
  const [enquiry, setEnquiry] = useState({ name: "", phone: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = planSchema.safeParse(plan === "enterprise" ? { plan, enquiry } : { plan });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path.at(-1))] ??= issue.message;
      setErrors(next);
      document.getElementById(`plan-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    onSubmit(parsed.data);
  };

  const enquiryField = (key: keyof typeof enquiry, label: string, multiline = false) => {
    const id = `plan-${key}`;
    const error = errors[key];
    const common = {
      id,
      className: inputClass,
      value: enquiry[key],
      "aria-invalid": Boolean(error) || undefined,
      "aria-describedby": describedBy(id, { error }),
    };
    return (
      <Field id={id} label={label} error={error}>
        {multiline ? (
          <textarea {...common} rows={4} onChange={(e) => setEnquiry((v) => ({ ...v, [key]: e.target.value }))} />
        ) : (
          <input {...common} type={key === "phone" ? "tel" : "text"} onChange={(e) => setEnquiry((v) => ({ ...v, [key]: e.target.value }))} />
        )}
      </Field>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {errorField || Object.values(errors).some(Boolean) ? <ErrorBanner message={errorMessage || "Please check the highlighted fields."} /> : null}

      <fieldset>
        <legend className="sr-only">Choose a plan</legend>
        <div className="grid gap-4 md:grid-cols-3">
          {STOREFRONT_PLANS.map((p) => {
            const id = PLAN_IDS[p.name];
            const selected = plan === id;
            return (
              <label key={p.name} className={`flex cursor-pointer flex-col rounded-2xl border-2 p-5 ${selected ? "border-xyvoo-teal-product-hover bg-emerald-50/40" : "border-slate-200"}`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="plan" value={id} checked={selected} onChange={() => setPlan(id)} className="accent-xyvoo-teal-product-hover" />
                  <span className="text-base font-semibold text-slate-900">{p.name}</span>
                </span>
                <span className="mt-3 text-2xl font-bold text-slate-900">{naira(p.priceDisplay)}</span>
                <span className="text-sm font-medium text-slate-700">{p.feeDisplay}</span>
                <span className="mt-2 text-sm text-slate-600">{p.description}</span>
                <ul className="mt-4 space-y-1 text-sm text-slate-700">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
              </label>
            );
          })}
        </div>
      </fieldset>

      {plan === "standard" ? (
        <p className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          Card payments for the Standard plan aren&rsquo;t switched on yet. We&rsquo;ll save your choice, and your shop runs on Free terms (4% per order) until
          Standard is active. Nothing will be charged without your say-so.
        </p>
      ) : null}

      {plan === "enterprise" ? (
        <section aria-labelledby="plan-enterprise-title" className="space-y-4 rounded-2xl border border-slate-200 p-5">
          <h2 id="plan-enterprise-title" className="text-base font-semibold text-slate-900">
            Tell our team what you need
          </h2>
          <p className="text-sm text-slate-600">We&rsquo;ll reply to your account email. Your shop starts on Free terms while we agree yours.</p>
          {enquiryField("name", "Your name")}
          {enquiryField("phone", "Phone number")}
          {enquiryField("message", "What would you like help with?", true)}
        </section>
      ) : null}

      <StepActions busy={busy} backHref={backHref} />
    </form>
  );
}
