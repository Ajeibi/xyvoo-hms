import { cache } from "react";
import { NextResponse } from "next/server";
import type { StorePlan } from "@/lib/store/site/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStandardPaidUp, type SubscriptionState } from "./billing";

/**
 * Which plans get which dashboard features, following the pricing table
 * (src/constants/pricing.ts). Every page and API that offers a feature checks
 * it through storeHasFeature() or featureUnavailable(), so changing a plan's
 * features is a change here only.
 */
const ALL = ["free", "standard", "enterprise"] as const;
const PAID = ["standard", "enterprise"] as const;

export const STORE_FEATURES = {
  analytics: ALL,
  abandonedCarts: ALL,
  customers: ALL,
  discountCodes: ALL,
  /** CSV and PDF downloads: orders, products, customers and analytics reports. */
  exports: PAID,
  customerExport: PAID,
  pushNotifications: PAID,
  customDomain: PAID,
  /** Sale prices that switch on and off by themselves. */
  flashSales: PAID,
  /** Showing prices in currencies other than the shop's own. */
  multiCurrency: PAID,
  /** Inviting staff and choosing their roles. */
  staff: PAID,
  activityLog: PAID,
  /** Automatic WhatsApp order messages to the shop and its customers (each one costs XYVOO a Meta fee). */
  whatsappMessages: PAID,
} as const satisfies Record<string, readonly StorePlan[]>;

export type StoreFeature = keyof typeof STORE_FEATURES;

/**
 * Plan gating is off while every feature is being built: all shops get everything, whatever
 * their plan. Once the tiers are decided, set STORE_PLAN_GATING=on and the table above applies.
 * Billing and the platform fee are not affected by this switch.
 */
export function planGatingOn() {
  return process.env.STORE_PLAN_GATING === "on";
}

export function storeHasFeature(plan: StorePlan | null | undefined, feature: StoreFeature) {
  if (!planGatingOn()) return true;
  return (STORE_FEATURES[feature] as readonly string[]).includes(plan ?? "free");
}

/**
 * The plan whose features the store gets now. Stores without a subscription
 * row are on Free, and so is a Standard store that hasn't paid (chosen but
 * unpaid, or lapsed after the grace period), the same rule as the fee.
 */
// Read once per request: a shop page asks in several places (layout, listing, prices).
export const getStorePlan = cache(async (tenantId: string): Promise<StorePlan> => {
  const { data } = await createServerSupabaseClient()
    .schema("store")
    .from("subscriptions")
    .select("plan, status, platform_fee_rate, current_period_end, grace_ends_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return planForFeatures(data as SubscriptionState | null);
});

export function planForFeatures(sub: SubscriptionState | null, now = Date.now()): StorePlan {
  if (sub?.plan === "enterprise") return "enterprise";
  return isStandardPaidUp(sub, now) ? "standard" : "free";
}

/** The message dashboard screens show in place of a Standard-only feature. */
export const UPGRADE_MESSAGE = "This is part of the Standard plan. Upgrade in Payments and plan to use it.";

/** For dashboard APIs: an error response when the store's plan doesn't include the feature. */
export async function featureUnavailable(tenantId: string, feature: StoreFeature) {
  if (storeHasFeature(await getStorePlan(tenantId), feature)) return null;
  return NextResponse.json(
    { error: UPGRADE_MESSAGE, upgrade: true },
    { status: 403 },
  );
}
