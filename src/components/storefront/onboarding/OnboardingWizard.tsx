"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/store/site/onboarding";
import { STEP_TITLES, type StepValues } from "@/lib/store/site/onboarding-steps";
import { ErrorBanner } from "./fields";
import BasicsStep from "./steps/BasicsStep";
import BrandStep from "./steps/BrandStep";
import EssentialsStep from "./steps/EssentialsStep";
import PlanStep from "./steps/PlanStep";
import PreviewStep from "./steps/PreviewStep";
import TemplateStep from "./steps/TemplateStep";

export type WizardInitial = {
  basics: Omit<StepValues<"basics">, "category" | "countryCode"> & { category: StepValues<"basics">["category"] | null; countryCode: string };
  template: StepValues<"template">;
  brand: StepValues<"brand">;
  essentials: StepValues<"essentials">;
  plan: { plan: StepValues<"plan">["plan"] };
};

export type StepProps<T> = {
  slug: string;
  initial: T;
  busy: boolean;
  /** Field the server rejected, e.g. "subdomain", so the step can mark it. */
  errorField: string | null;
  errorMessage: string;
  backHref: string | null;
  onSubmit: (values: unknown) => void;
};

const STEP_INTROS: Record<OnboardingStep, string> = {
  basics: "Tell us about your store. You can change any of this later.",
  template: "Pick the look for your shop. You'll be able to change the colours and words afterwards.",
  brand: "Add your logo and choose your colours and fonts.",
  essentials: "How customers can reach you, and what delivery costs.",
  plan: "Choose how you'd like to pay for XYVOO. You can change plan at any time.",
  preview: "Here's your shop with everything you've entered. It isn't public yet.",
};

/**
 * The five-step store setup after registration, plus a preview. Each step is
 * saved on the server before moving on, so the merchant can stop and pick up
 * where they left off.
 */
export default function OnboardingWizard({
  slug,
  step,
  completedSteps,
  storeName,
  rootDomain,
  initial,
}: {
  slug: string;
  step: OnboardingStep;
  completedSteps: OnboardingStep[];
  storeName: string;
  rootDomain: string;
  initial: WizardInitial;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field: string | null }>({ message: "", field: null });
  const heading = useRef<HTMLHeadingElement>(null);

  const index = ONBOARDING_STEPS.indexOf(step);
  const backHref = index > 0 ? `/storefront/${slug}/welcome/${ONBOARDING_STEPS[index - 1]}` : null;

  const submit = async (values: unknown) => {
    setBusy(true);
    setError({ message: "", field: null });
    try {
      const res = await fetch("/api/store/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, step, values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: typeof data.error === "string" ? data.error : "We couldn't save that. Please try again.", field: data.field ?? null });
        heading.current?.focus();
        setBusy(false);
        return;
      }
      if (!data.nextStep) {
        // Setup finished: a full load so the dashboard layout sees the completed setup.
        window.location.assign(`/storefront/${data.slug}/dashboard`);
        return;
      }
      router.push(`/storefront/${data.slug}/welcome/${data.nextStep}`);
    } catch {
      setError({ message: "We couldn't connect. Check your internet connection and try again.", field: null });
      setBusy(false);
    }
  };

  const common = { slug, busy, backHref, errorField: error.field, errorMessage: error.message, onSubmit: submit };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <p className="text-sm font-semibold text-slate-900">
            XYVOO <span className="font-normal text-slate-500">· Setting up {storeName}</span>
          </p>
          <form action="/auth/logout" method="post">
            <button type="submit" className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Setup steps">
          <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {ONBOARDING_STEPS.map((s, i) => {
              const done = completedSteps.includes(s);
              const current = s === step;
              const label = (
                <>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      current ? "bg-xyvoo-teal-product-hover text-white" : done ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}
                    aria-hidden
                  >
                    {done && !current ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="whitespace-nowrap">{STEP_TITLES[s]}</span>
                  {done && !current ? <span className="sr-only">(done)</span> : null}
                </>
              );
              const classes = `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${current ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600"}`;
              return (
                <li key={s}>
                  {done && !current ? (
                    <Link href={`/storefront/${slug}/welcome/${s}`} className={`${classes} hover:bg-white`}>
                      {label}
                    </Link>
                  ) : (
                    <span className={classes} aria-current={current ? "step" : undefined}>
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <p className="text-sm font-medium text-xyvoo-teal-product-hover">
            Step {index + 1} of {ONBOARDING_STEPS.length}
          </p>
          <h1 ref={heading} tabIndex={-1} className="mt-1 text-2xl font-bold text-slate-900 focus:outline-none">
            {STEP_TITLES[step]}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{STEP_INTROS[step]}</p>

          <div className="mt-6 space-y-6">
            {error.message && !error.field ? <ErrorBanner message={error.message} /> : null}
            {step === "basics" ? <BasicsStep {...common} initial={initial.basics} rootDomain={rootDomain} /> : null}
            {step === "template" ? <TemplateStep {...common} initial={initial.template} /> : null}
            {step === "brand" ? <BrandStep {...common} initial={initial.brand} templateSlug={initial.template.templateSlug} storeName={storeName} /> : null}
            {step === "essentials" ? <EssentialsStep {...common} initial={initial.essentials} /> : null}
            {step === "plan" ? <PlanStep {...common} initial={initial.plan} /> : null}
            {step === "preview" ? <PreviewStep {...common} initial={null} /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
