/** Wizard steps in order. Mirrors the check constraint on store.onboarding.current_step. */
export const ONBOARDING_STEPS = ["basics", "template", "brand", "essentials", "plan", "preview"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STORE_PLANS = ["free", "standard", "enterprise"] as const;
export type StorePlan = (typeof STORE_PLANS)[number];

/** Platform fee per plan as a fraction (0.04 = 4%). Enterprise is agreed per tenant and starts on Free. */
export const PLAN_FEE_RATES: Record<StorePlan, number> = { free: 0.04, standard: 0, enterprise: 0.04 };

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

export function isStorePlan(value: unknown): value is StorePlan {
  return typeof value === "string" && (STORE_PLANS as readonly string[]).includes(value);
}

export type OnboardingProgress = {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  completedAt: string | null;
};

/** Marks a step done and moves to the first step not yet completed. */
export function completeStep(progress: OnboardingProgress, step: OnboardingStep): OnboardingProgress {
  const completed = ONBOARDING_STEPS.filter((s) => s === step || progress.completedSteps.includes(s));
  const next = ONBOARDING_STEPS.find((s) => !completed.includes(s));

  return {
    currentStep: next ?? "preview",
    completedSteps: completed,
    completedAt: next ? progress.completedAt : progress.completedAt ?? new Date().toISOString(),
  };
}

/** A merchant may revisit any completed step, or the step they're on, but not skip ahead. */
export function canOpenStep(progress: OnboardingProgress, step: OnboardingStep) {
  return step === progress.currentStep || progress.completedSteps.includes(step);
}
