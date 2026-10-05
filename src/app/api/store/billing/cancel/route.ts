import { NextResponse } from "next/server";
import { z } from "zod";
import { disableSubscription } from "@/lib/payments/platform-paystack";
import { paystackFailure, resolveBillingRequest } from "@/lib/store/payout-routes";
import { recordCancelled } from "@/lib/store/subscriptions";

const Schema = z.object({ slug: z.string().min(1) });

/**
 * POST /api/store/billing/cancel — stops the Standard plan renewing. The
 * store keeps 0% fees until the end of the month already paid for.
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const resolved = await resolveBillingRequest(parsed.data.slug);
  if (resolved.error) return resolved.error;

  const { data: sub } = await resolved.service
    .schema("store")
    .from("subscriptions")
    .select("plan, paystack_subscription_code, paystack_email_token")
    .eq("tenant_id", resolved.access.tenantId)
    .maybeSingle();

  if (sub?.plan !== "standard" || !sub.paystack_subscription_code || !sub.paystack_email_token) {
    return NextResponse.json(
      { error: "We couldn't find an active Standard subscription to cancel. If you've just subscribed, try again in a few minutes." },
      { status: 409 },
    );
  }

  try {
    await disableSubscription(resolved.platform, sub.paystack_subscription_code, sub.paystack_email_token);
    await recordCancelled(sub.paystack_subscription_code);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return paystackFailure(error, "We couldn't cancel the plan just now. Please try again.");
  }
}
