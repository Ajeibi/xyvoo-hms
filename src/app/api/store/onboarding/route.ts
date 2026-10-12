import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { getOnboardingProgress, saveOnboardingProgress } from "@/lib/store/site/data";
import { canOpenStep, completeStep, ONBOARDING_STEPS } from "@/lib/store/site/onboarding";
import { STEP_SCHEMAS } from "@/lib/store/site/onboarding-steps";
import { ensureDefaultPages } from "@/lib/store/default-pages-server";
import { saveBasics, saveBrand, saveEssentials, savePlan, saveTemplate, StepError } from "@/lib/store/site/onboarding-save";

const BodySchema = z.object({
  slug: z.string().min(1),
  step: z.enum(ONBOARDING_STEPS),
  values: z.unknown(),
});

/**
 * POST /api/store/onboarding
 * Saves one step of the onboarding wizard for the signed-in owner or admin,
 * marks it complete and returns the next step (and the store's slug, which
 * changes if the owner picked a different web address in step 1).
 */
export async function POST(req: Request) {
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { slug, step } = body.data;

  const resolved = await resolveStoreRequest(slug);
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  if (!capabilities.canManageSettings) {
    return NextResponse.json({ error: "Only the store owner or an admin can set up the store." }, { status: 403 });
  }

  const progress = await getOnboardingProgress(access.tenantId);
  if (!progress) return NextResponse.json({ error: "This store has no setup record." }, { status: 409 });
  if (!canOpenStep(progress, step)) {
    return NextResponse.json({ error: "Please finish the earlier steps first.", currentStep: progress.currentStep }, { status: 409 });
  }

  const parsed = STEP_SCHEMAS[step].safeParse(body.data.values);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message || "Please check the form.",
        field: parsed.error.issues[0]?.path.join("."),
        errors,
      },
      { status: 400 },
    );
  }

  const ctx = { tenantId: access.tenantId, slug, userEmail: null as string | null };
  let nextSlug = slug;
  try {
    switch (step) {
      case "basics":
        nextSlug = await saveBasics(ctx, STEP_SCHEMAS.basics.parse(parsed.data));
        break;
      case "template":
        await saveTemplate(ctx, STEP_SCHEMAS.template.parse(parsed.data));
        break;
      case "brand":
        await saveBrand(ctx, STEP_SCHEMAS.brand.parse(parsed.data), access.storeDisplayName);
        break;
      case "essentials":
        await saveEssentials(ctx, STEP_SCHEMAS.essentials.parse(parsed.data));
        // The shop's About, Contact, FAQs and policy pages, written from what it's told us so far.
        await ensureDefaultPages(access.tenantId).catch((error) => console.error("[onboarding] default pages not created", error));
        break;
      case "plan": {
        const { data } = await resolved.service.auth.admin.getUserById(access.userId);
        await savePlan({ ...ctx, userEmail: data.user?.email ?? null }, STEP_SCHEMAS.plan.parse(parsed.data), access.storeDisplayName);
        break;
      }
      case "preview":
        break;
    }
  } catch (error) {
    if (error instanceof StepError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(`[onboarding] saving ${step} failed`, error);
    return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  }

  const next = completeStep(progress, step);
  await saveOnboardingProgress(access.tenantId, next);

  // Going back through a finished setup moves on step by step; the last step returns to the dashboard.
  const following = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1] ?? null;
  const nextStep = progress.completedAt ? following : next.completedAt ? null : next.currentStep;
  return NextResponse.json({ ok: true, slug: nextSlug, nextStep });
}
