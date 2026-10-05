import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { initializeSubscription } from "@/lib/payments/platform-paystack";
import { STANDARD_CURRENCY, STANDARD_PRICE } from "@/lib/store/billing";
import { paystackFailure, resolveBillingRequest } from "@/lib/store/payout-routes";

const Schema = z.object({ slug: z.string().min(1) });

/**
 * POST /api/store/billing/subscribe — starts the Standard plan: records the
 * payment we expect, then sends the owner to Paystack to pay the first month.
 * Paystack sets up the monthly subscription when that payment succeeds.
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const resolved = await resolveBillingRequest(parsed.data.slug);
  if (resolved.error) return resolved.error;
  const { access, service, platform } = resolved;

  const { data: owner } = await service.auth.admin.getUserById(access.userId);
  const email = owner.user?.email;
  if (!email) return NextResponse.json({ error: "Your account has no email address to bill." }, { status: 400 });

  const reference = `xysub_${randomBytes(9).toString("hex")}`;
  const { error } = await service
    .schema("store")
    .from("subscription_payments")
    .insert({ reference, tenant_id: access.tenantId, plan: "standard", amount: STANDARD_PRICE, currency_code: STANDARD_CURRENCY });
  if (error) return NextResponse.json({ error: "We couldn't start the payment. Please try again." }, { status: 500 });

  try {
    const authorizationUrl = await initializeSubscription(platform, {
      email,
      amountSubunits: STANDARD_PRICE * 100,
      reference,
      callbackUrl: `${new URL(req.url).origin}/storefront/${encodeURIComponent(parsed.data.slug)}/billing/callback`,
      metadata: { purpose: "store_subscription", tenant_id: access.tenantId },
    });
    return NextResponse.json({ authorizationUrl });
  } catch (err) {
    return paystackFailure(err, "We couldn't reach Paystack. Please try again.");
  }
}
