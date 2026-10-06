import { NextResponse } from "next/server";
import type { StorePlan } from "@/lib/store/site/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Which plans get which dashboard features. Everything is on every plan for
 * now; restricting a feature later is a one-line change here, and every page
 * and API that offers the feature checks it through storeHasFeature().
 */
export const STORE_FEATURES = {
  analytics: ["free", "standard", "enterprise"],
  abandonedCarts: ["free", "standard", "enterprise"],
  customers: ["free", "standard", "enterprise"],
  customerExport: ["free", "standard", "enterprise"],
  pushNotifications: ["free", "standard", "enterprise"],
} as const satisfies Record<string, readonly StorePlan[]>;

export type StoreFeature = keyof typeof STORE_FEATURES;

export function storeHasFeature(plan: StorePlan | null | undefined, feature: StoreFeature) {
  return (STORE_FEATURES[feature] as readonly string[]).includes(plan ?? "free");
}

/** The store's current plan (stores without a subscription row are on Free). */
export async function getStorePlan(tenantId: string): Promise<StorePlan> {
  const { data } = await createServerSupabaseClient().schema("store").from("subscriptions").select("plan").eq("tenant_id", tenantId).maybeSingle();
  const plan = data?.plan as StorePlan | undefined;
  return plan === "standard" || plan === "enterprise" ? plan : "free";
}

/** For dashboard APIs: an error response when the store's plan doesn't include the feature. */
export async function featureUnavailable(tenantId: string, feature: StoreFeature) {
  if (storeHasFeature(await getStorePlan(tenantId), feature)) return null;
  return NextResponse.json({ error: "This feature isn't included in your plan. Upgrade in Payments to use it." }, { status: 403 });
}
