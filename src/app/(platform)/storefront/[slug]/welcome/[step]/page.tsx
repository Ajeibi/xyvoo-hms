import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import OnboardingWizard, { type WizardInitial } from "@/components/storefront/onboarding/OnboardingWizard";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { getOnboardingProgress, getStoreSite } from "@/lib/store/site/data";
import { canOpenStep, isOnboardingStep, isStorePlan } from "@/lib/store/site/onboarding";
import { homeCurrencyFor, STEP_TITLES } from "@/lib/store/site/onboarding-steps";
import { getStorefrontTemplate, isStorefrontTemplateSlug, suggestTemplateFor, type StoreCategory } from "@/lib/store/site/templates";
import { STOREFRONT_ROOT_DOMAIN } from "@/lib/store/subdomain";
import { parseCurrencySettings } from "@/lib/store/currencies";
import { linksFromSocials } from "@/lib/store/socials";
import { isStandardPaidUp, type SubscriptionState } from "@/lib/store/billing";
import { getPlatformPaystack } from "@/lib/payments/platform-paystack";

type Props = { params: Promise<{ slug: string; step: string }>; searchParams: Promise<{ reference?: string; trxref?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { step } = await params;
  return { title: isOnboardingStep(step) ? `Set up your store: ${STEP_TITLES[step]}` : "Set up your store", robots: { index: false } };
}

export default async function OnboardingStepPage({ params, searchParams }: Props) {
  const { slug, step } = await params;
  // Paystack sends the owner back to the plan step with the payment reference after paying for Standard.
  const { reference, trxref } = await searchParams;
  if (!isOnboardingStep(step)) notFound();

  const access = await getStoreAccessContext(slug);
  if (!access.tenantId || !access.role) redirect(access.homePath);
  if (!getStoreCapabilities(access.role).canManageSettings) redirect(`/storefront/${slug}/dashboard`);

  const progress = await getOnboardingProgress(access.tenantId);
  // Shops that finished setup can go back through it at any time (Website > "Go through setup again").
  if (!progress) redirect(`/storefront/${slug}/dashboard`);
  if (!canOpenStep(progress, step)) redirect(`/storefront/${slug}/welcome/${progress.currentStep}`);

  const store = createServerSupabaseClient().schema("store");
  const [site, profileResult, zonesResult, subscriptionResult, onboardingResult, newerProfileResult, authUser] = await Promise.all([
    getStoreSite(access.tenantId),
    store
      .from("business_profile")
      .select("category, country_code, business_email, phone, whatsapp, address_line1, city, state, socials")
      .eq("tenant_id", access.tenantId)
      .maybeSingle(),
    store.from("delivery_zones").select("name, fee, free_over, is_pickup, is_active").eq("tenant_id", access.tenantId),
    store.from("subscriptions").select("plan, status, platform_fee_rate, current_period_end, grace_ends_at").eq("tenant_id", access.tenantId).maybeSingle(),
    store.from("onboarding").select("data").eq("tenant_id", access.tenantId).maybeSingle(),
    // Separate query for the newer columns, so the rest still loads before their migrations have run.
    store.from("business_profile").select("currency_code, currencies, category_detail").eq("tenant_id", access.tenantId).maybeSingle(),
    // The email and phone they signed up with, to fill in the contact step.
    createSupabaseAuthServerClient().then((auth) => auth.auth.getUser()).then((r) => r.data.user),
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
  const standardPaidUp = isStandardPaidUp(subscription as SubscriptionState | null);

  const initial: WizardInitial = {
    basics: {
      storeName: access.storeDisplayName,
      subdomain: slug,
      category,
      categoryOther: (newerProfileResult.data?.category_detail as string | null) ?? "",
      countryCode: (profile?.country_code as string) || "NG",
      currencyCode: homeCurrencyFor((profile?.country_code as string) || "NG", newerProfileResult.data?.currency_code as string | undefined),
      extraCurrencies: parseCurrencySettings(newerProfileResult.data?.currencies, (newerProfileResult.data?.currency_code as string) || "NGN").extra.map((c) => c.code),
    },
    template: { templateSlug },
    brand: {
      logoUrl: site?.draft.brand?.logoUrl ?? access.logoUrl,
      accent: site?.draft.theme?.colours?.accent ?? null,
      fontPairing: site?.draft.theme?.fontPairing ?? template.theme.fontPairing,
      customFont: site?.draft.theme?.customFont ?? null,
      tagline: site?.draft.brand?.tagline ?? "",
    },
    essentials: {
      businessEmail: profile?.business_email || authUser?.email || "",
      phone: profile?.phone || (authUser?.user_metadata?.phone as string | undefined) || authUser?.phone || "",
      whatsapp: profile?.whatsapp ?? "",
      addressLine1: profile?.address_line1 ?? "",
      city: profile?.city ?? "",
      state: profile?.state ?? "",
      deliveryFee: delivery ? Number(delivery.fee) : 0,
      freeDeliveryOver: delivery?.free_over != null ? Number(delivery.free_over) : null,
      offersPickup: Boolean(pickup?.is_active),
      socialLinks: linksFromSocials(socials),
    },
    plan: {
      plan: standardPaidUp
        ? "standard"
        : progress.completedSteps.includes("plan") && subscription && isStorePlan(subscription.plan)
          ? subscription.status === "pending_payment" ? "standard" : subscription.plan
          : isStorePlan(intent.plan) ? intent.plan : "free",
      billing: {
        available: Boolean(getPlatformPaystack()?.standardPlanCode),
        paidUp: standardPaidUp,
        reference: step === "plan" ? (reference || trxref || null) : null,
      },
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
