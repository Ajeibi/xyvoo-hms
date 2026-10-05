import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import OnboardingWizard, { type WizardInitial } from "@/components/storefront/onboarding/OnboardingWizard";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOnboardingProgress, getStoreSite } from "@/lib/store/site/data";
import { canOpenStep, isOnboardingStep, isStorePlan } from "@/lib/store/site/onboarding";
import { STEP_TITLES } from "@/lib/store/site/onboarding-steps";
import { getStorefrontTemplate, isStorefrontTemplateSlug, suggestTemplateFor, type StoreCategory } from "@/lib/store/site/templates";
import { STOREFRONT_ROOT_DOMAIN } from "@/lib/store/subdomain";

type Props = { params: Promise<{ slug: string; step: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { step } = await params;
  return { title: isOnboardingStep(step) ? `Set up your store: ${STEP_TITLES[step]}` : "Set up your store", robots: { index: false } };
}

export default async function OnboardingStepPage({ params }: Props) {
  const { slug, step } = await params;
  if (!isOnboardingStep(step)) notFound();

  const access = await getStoreAccessContext(slug);
  if (!access.tenantId || !access.role) redirect(access.homePath);
  if (!getStoreCapabilities(access.role).canManageSettings) redirect(`/storefront/${slug}/dashboard`);

  const progress = await getOnboardingProgress(access.tenantId);
  if (!progress || progress.completedAt) redirect(`/storefront/${slug}/dashboard`);
  if (!canOpenStep(progress, step)) redirect(`/storefront/${slug}/welcome/${progress.currentStep}`);

  const store = createServerSupabaseClient().schema("store");
  const [site, profileResult, zonesResult, subscriptionResult, onboardingResult] = await Promise.all([
    getStoreSite(access.tenantId),
    store
      .from("business_profile")
      .select("category, country_code, business_email, phone, whatsapp, address_line1, city, state, socials")
      .eq("tenant_id", access.tenantId)
      .maybeSingle(),
    store.from("delivery_zones").select("name, fee, free_over, is_pickup, is_active").eq("tenant_id", access.tenantId),
    store.from("subscriptions").select("plan, status").eq("tenant_id", access.tenantId).maybeSingle(),
    store.from("onboarding").select("data").eq("tenant_id", access.tenantId).maybeSingle(),
  ]);

  const profile = profileResult.data;
  const zones = zonesResult.data || [];
  const delivery = zones.find((z) => !z.is_pickup);
  const pickup = zones.find((z) => z.is_pickup);
  const socials = (profile?.socials as Record<string, string> | null) ?? {};
  // Choices carried in from the pricing card or template gallery (?plan=, ?template=).
  const intent = (onboardingResult.data?.data as { plan?: string; template?: string } | null) ?? {};
  const category = (profile?.category as StoreCategory | null) ?? null;
  const templateChosen = progress.completedSteps.includes("template");
  const templateSlug = templateChosen
    ? site?.templateSlug ?? suggestTemplateFor(category)
    : isStorefrontTemplateSlug(intent.template)
      ? intent.template
      : suggestTemplateFor(category);
  const template = getStorefrontTemplate(site?.templateSlug);
  const subscription = subscriptionResult.data;

  const initial: WizardInitial = {
    basics: {
      storeName: access.storeDisplayName,
      subdomain: slug,
      category,
      countryCode: (profile?.country_code as string) || "NG",
    },
    template: { templateSlug },
    brand: {
      logoUrl: site?.draft.brand?.logoUrl ?? access.logoUrl,
      accent: site?.draft.theme?.colours?.accent ?? null,
      fontPairing: site?.draft.theme?.fontPairing ?? template.theme.fontPairing,
      tagline: site?.draft.brand?.tagline ?? "",
    },
    essentials: {
      businessEmail: profile?.business_email ?? "",
      phone: profile?.phone ?? "",
      whatsapp: profile?.whatsapp ?? "",
      addressLine1: profile?.address_line1 ?? "",
      city: profile?.city ?? "",
      state: profile?.state ?? "",
      deliveryFee: delivery ? Number(delivery.fee) : 0,
      freeDeliveryOver: delivery?.free_over != null ? Number(delivery.free_over) : null,
      offersPickup: Boolean(pickup?.is_active),
      instagram: socials.instagram ?? "",
      facebook: socials.facebook ?? "",
      tiktok: socials.tiktok ?? "",
    },
    plan: {
      plan: progress.completedSteps.includes("plan") && subscription && isStorePlan(subscription.plan)
        ? subscription.status === "pending_payment" ? "standard" : subscription.plan
        : isStorePlan(intent.plan) ? intent.plan : "free",
    },
  };

  return (
    <OnboardingWizard
      slug={slug}
      step={step}
      completedSteps={progress.completedSteps}
      storeName={access.storeDisplayName}
      rootDomain={STOREFRONT_ROOT_DOMAIN}
      initial={initial}
    />
  );
}
