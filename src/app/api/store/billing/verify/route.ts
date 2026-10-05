import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { getPlatformPaystack } from "@/lib/payments/platform-paystack";
import { verifyTransaction } from "@/lib/shop/paystack";
import { STANDARD_PRICE } from "@/lib/store/billing";
import { activateStandard, markSubscriptionPaymentFailed } from "@/lib/store/subscriptions";

/**
 * GET /api/store/billing/verify?slug=&reference= — called by the page the
 * owner returns to from Paystack. The payment must be one we started for
 * this store, and its result comes from Paystack directly.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const reference = url.searchParams.get("reference") || "";
  const resolved = await resolveStoreRequest(url.searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!reference) return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });

  const { data: payment } = await resolved.service
    .schema("store")
    .from("subscription_payments")
    .select("tenant_id, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!payment || payment.tenant_id !== resolved.access.tenantId) {
    return NextResponse.json({ error: "We couldn't find that payment." }, { status: 404 });
  }
  if (payment.status === "success") return NextResponse.json({ status: "success" });

  const platform = getPlatformPaystack();
  if (!platform) return NextResponse.json({ error: "Payments aren't available right now." }, { status: 503 });

  try {
    const result = await verifyTransaction({ secretKey: platform.secretKey, reference });
    if (result.status === "success") {
      if (result.amountSubunit !== STANDARD_PRICE * 100) {
        return NextResponse.json({ error: "The amount paid doesn't match the plan price. Please contact XYVOO support." }, { status: 409 });
      }
      const raw = result.raw as { customer?: { customer_code?: string }; paid_at?: string };
      await activateStandard({
        reference,
        customerCode: raw.customer?.customer_code ?? null,
        paidAt: raw.paid_at ? new Date(raw.paid_at) : new Date(),
      });
    } else if (result.status === "failed" || result.status === "abandoned") {
      await markSubscriptionPaymentFailed(reference, result.status);
    }
    return NextResponse.json({ status: result.status });
  } catch (error) {
    console.error("[billing/verify]", error);
    return NextResponse.json({ error: "We couldn't confirm the payment with Paystack. Please refresh in a minute." }, { status: 502 });
  }
}
