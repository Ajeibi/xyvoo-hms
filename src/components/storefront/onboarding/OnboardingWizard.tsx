"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { LOGO_URL } from "@/constants/branding";
import { useRouter } from "next/navigation";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/store/site/onboarding";
import { homeCurrencyFor, STEP_TITLES, type StepValues } from "@/lib/store/site/onboarding-steps";
import StorefrontValidationModal, { type ValidationErrorItem } from "@/components/storefront/StorefrontValidationModal";
import { ErrorBanner } from "./fields";
import OnboardingShowcase, { ONBOARDING_SHOWCASE } from "./OnboardingShowcase";
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
  plan: {
    plan: StepValues<"plan">["plan"];
    /** Paying for Standard from setup: whether it's possible, already done, or just returned from Paystack. */
    billing: { available: boolean; paidUp: boolean; reference: string | null };
  };
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
  plan: "Choose your XYVOO plan. You can change it at any time from Payments and plan.",
  preview: "Here's your website with everything you've entered: your home page, your shop and the pages we've written for you.",
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
  const [modalErrors, setModalErrors] = useState<ValidationErrorItem[]>([]);
  const [showModal, setShowModal] = useState(false);
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
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          const list: ValidationErrorItem[] = data.errors.map((e: { field?: string; message: string }) => ({
            field: e.field,
            label: e.field ? e.field.split(".").pop() : undefined,
            message: e.message,
          }));
          setModalErrors(list);
          setShowModal(true);
        }
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
  const showcase = ONBOARDING_SHOWCASE[step];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {/* Same size as the main website header. */}
            <Image src={LOGO_URL} alt="XYVOO" width={125} height={50} preload className="h-[50px] w-auto shrink-0" />
            <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />
            <p className="hidden min-w-0 truncate text-sm text-slate-600 sm:block">
              Setting up <span className="font-semibold text-slate-900">{storeName}</span>
            </p>
          </div>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-teal-product-hover focus-visible:ring-offset-2"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className={`mx-auto grid max-w-6xl gap-8 py-0 sm:px-6 sm:py-8 ${showcase ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start" : ""}`}>
        {showcase ? (
          <aside className="hidden lg:sticky lg:top-[104px] lg:block">
            <OnboardingShowcase showcase={showcase} />
            <StepDots slug={slug} step={step} completedSteps={completedSteps} centred className="mt-5" />
          </aside>
        ) : null}

        {/* On phones the card runs edge to edge, so its padding is the only gutter. */}
        <main className="border-b border-slate-200 bg-white px-4 py-6 sm:rounded-2xl sm:border sm:p-8">
          {/* Beside the photo the dots sit under it; on phones, and steps without a photo, they're here. */}
          <StepDots slug={slug} step={step} completedSteps={completedSteps} className={`mb-5 ${showcase ? "lg:hidden" : ""}`} />
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
            {step === "essentials" ? <EssentialsStep
                {...common}
                initial={initial.essentials}
                countryCode={initial.basics.countryCode}
                homeCurrency={homeCurrencyFor(initial.basics.countryCode, initial.basics.currencyCode)}
              /> : null}
            {step === "plan" ? <PlanStep {...common} initial={initial.plan} /> : null}
            {step === "preview" ? <PreviewStep {...common} initial={null} /> : null}
          </div>
        </main>
      </div>

      <StorefrontValidationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        errors={modalErrors}
        title="Setup Details Incomplete"
        description="Please check and resolve the following issue before continuing:"
        confirmText="Okay, I will complete them"
      />
    </div>
  );
}

/**
 * Setup progress as small dots: the current step is a wider pill, finished
 * steps link back. Each dot has a 24px target and a full label for screen readers.
 */
function StepDots({
  slug,
  step,
  completedSteps,
  centred = false,
  className = "",
}: {
  slug: string;
  step: OnboardingStep;
  completedSteps: OnboardingStep[];
  centred?: boolean;
  className?: string;
}) {
  return (
    <nav aria-label="Setup steps" className={className}>
      <ol className={`flex items-center gap-1 ${centred ? "justify-center" : ""}`}>
        {ONBOARDING_STEPS.map((s, i) => {
          const current = s === step;
          const done = completedSteps.includes(s);
          const label = `Step ${i + 1}: ${STEP_TITLES[s]}${current ? " (current step)" : done ? " (done)" : ""}`;
          const dot = (
            <span
              aria-hidden
              className={`block h-2 rounded-full transition-all ${
                current ? "w-6 bg-xyvoo-teal-product-hover" : done ? "w-2 bg-xyvoo-teal-product-hover/45 group-hover:bg-xyvoo-teal-product-hover/70" : "w-2 bg-slate-300"
              }`}
            />
          );
          return (
            <li key={s}>
              {done && !current ? (
                <Link href={`/storefront/${slug}/welcome/${s}`} title={STEP_TITLES[s]} className="group flex h-6 min-w-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-teal-product-hover">
                  {dot}
                  <span className="sr-only">{label}</span>
                </Link>
              ) : (
                <span className="flex h-6 min-w-6 items-center justify-center" aria-current={current ? "step" : undefined} title={STEP_TITLES[s]}>
                  {dot}
                  <span className="sr-only">{label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
