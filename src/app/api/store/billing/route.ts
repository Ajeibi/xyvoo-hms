import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { getPlatformPaystack } from "@/lib/payments/platform-paystack";
import { describeSubscription, effectiveFeeRate, isStandardPaidUp, STANDARD_CURRENCY, STANDARD_PRICE } from "@/lib/store/billing";
import { getStoreSubscription } from "@/lib/store/payments";

/** GET /api/store/billing?slug= — the store's plan, current fee and what it can do next. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;

  const subscription = await getStoreSubscription(resolved.access.tenantId);
  const platform = getPlatformPaystack();
  const paidUp = isStandardPaidUp(subscription);

  return NextResponse.json({
    plan: subscription?.plan ?? "free",
    status: subscription?.status ?? "active",
    summary: describeSubscription(subscription),
    feeRate: effectiveFeeRate(subscription),
    standardPrice: STANDARD_PRICE,
    standardCurrency: STANDARD_CURRENCY,
    canManage: resolved.capabilities.canManageSettings,
    canSubscribe: Boolean(platform?.standardPlanCode) && subscription?.plan !== "enterprise" && !(paidUp && subscription?.status === "active"),
    canCancel: subscription?.plan === "standard" && (subscription.status === "active" || subscription.status === "past_due"),
    billingAvailable: Boolean(platform?.standardPlanCode),
  });
}
