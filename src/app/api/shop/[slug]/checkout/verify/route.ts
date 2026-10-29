import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPaystackKeyForReference } from "@/lib/store/payments";
import { finalizeCardPayment } from "@/lib/store/card-payments";
import { alertCardPaymentFailed } from "@/lib/store/merchant-alerts";
import { verifyTransaction } from "@/lib/shop/paystack";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { toSubunitAmount } from "@/lib/shop/checkout";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { isSimulatedIntent, simulatedPaymentsEnabled } from "@/lib/payments/simulated";
import { shopperT } from "@/lib/store/i18n/shopper";

/**
 * Called by the page the shopper lands on after Paystack redirects them
 * back. Never trusts the query string beyond the reference itself -- the
 * tenant is resolved from OUR OWN payment_intents record, and must match the
 * shop in the URL, and the actual payment status always comes from a fresh
 * server-to-server call to Paystack's verify endpoint.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference") || "";
  if (!reference) return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });

  // Each call reaches Paystack and returns order details, so it's limited like checkout.
  const limited = await rateLimitShared(`verify:${clientIp(req)}`, 30, 10 * 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  }

  const service = createServerSupabaseClient();
  const [tenant, { data: intent }] = await Promise.all([
    /^[a-z0-9-]{1,63}$/i.test(slug) ? getShopTenantBySlug(slug) : Promise.resolve(null),
    service.schema("store").from("payment_intents").select("order_id, tenant_id, amount, currency_code, metadata").eq("paystack_reference", reference).maybeSingle(),
  ]);
  // The same answer for "no such payment" and "not this shop's payment".
  if (!tenant) return NextResponse.json({ error: "Payment reference not found." }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);
  if (!intent || intent.tenant_id !== tenant.id) {
    return NextResponse.json({ error: t("errors.coPaymentNotFound") }, { status: 404 });
  }

  // Which account the payment ran on (XYVOO's for split payments, the store's
  // own otherwise) comes from our own records, never from the request.
  // A test payment (development only) is answered from what was chosen on the pretend card page.
  let verification: { status: string; amountSubunit?: number; currency?: string };
  if (isSimulatedIntent(intent.metadata)) {
    if (!simulatedPaymentsEnabled()) return NextResponse.json({ error: t("errors.coPaymentNotFound") }, { status: 404 });
    const outcome = (intent.metadata as { simulated_outcome?: string }).simulated_outcome;
    verification = { status: outcome ?? "pending", amountSubunit: toSubunitAmount(Number(intent.amount)), currency: String(intent.currency_code || "NGN") };
  } else {
    const paystack = await getPaystackKeyForReference(reference);
    if (!paystack) return NextResponse.json({ error: t("errors.coPaymentNotFound") }, { status: 404 });
    try {
      verification = await verifyTransaction({ secretKey: paystack.secretKey, reference });
    } catch {
      return NextResponse.json({ error: t("errors.coPaymentCheckFailed") }, { status: 502 });
    }
  }

  if (verification.status === "success") {
    let result;
    try {
      result = await finalizeCardPayment({ reference, amountSubunit: verification.amountSubunit, currency: verification.currency });
    } catch {
      return NextResponse.json({ error: t("errors.coPaidNotFinished") }, { status: 500 });
    }
    if (result === "mismatch") {
      return NextResponse.json({ error: t("errors.coPaymentMismatch") }, { status: 409 });
    }
  } else {
    await service.schema("store").from("payment_intents").update({ status: verification.status }).eq("paystack_reference", reference);

    if (verification.status === "failed" || verification.status === "abandoned") {
      // Failed card orders release their stock on the next release run.
      await service.schema("store").from("orders").update({ payment_status: "failed" }).eq("id", intent.order_id).eq("payment_status", "unpaid");
    }
    // Tell the shop a card was declined (once per order; never throws). Abandoned means the shopper left, so no alert.
    if (verification.status === "failed") await alertCardPaymentFailed(intent.tenant_id as string, intent.order_id as string);
  }

  const { data: order } = await service
    .schema("store")
    .from("orders")
    .select(
      "id, customer_name, customer_email, status, payment_status, total_amount, delivery_fee, delivery_method, discount_code, discount_amount, gift_card_amount, shipping_address, created_at, order_items(product_id, variant_id, product_name, quantity, unit_price, line_total)",
    )
    .eq("id", intent.order_id)
    .single();
  // Tax is read on its own, like the receipt does, so a database without the tax columns still answers.
  const tax = order
    ? await service.schema("store").from("orders").select("tax_amount, tax_inclusive").eq("id", intent.order_id).maybeSingle()
    : null;
  const taxRow = tax && !tax.error ? (tax.data as { tax_amount?: unknown; tax_inclusive?: unknown } | null) : null;

  return NextResponse.json({
    status: verification.status,
    order: order
      ? { ...order, tax_amount: Number(taxRow?.tax_amount) || 0, tax_inclusive: Boolean(taxRow?.tax_inclusive) }
      : null,
  });
}
