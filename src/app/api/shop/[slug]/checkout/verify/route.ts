import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTenantIdByPaystackReference, getTenantPaystackSetup } from "@/lib/shop/tenants";
import { toSubunitAmount } from "@/lib/shop/checkout";
import { verifyTransaction } from "@/lib/shop/paystack";

/**
 * Called by the page the shopper lands on after Paystack redirects them
 * back. Never trusts the query string beyond the reference itself -- the
 * tenant is resolved from OUR OWN payment_intents record (never the [slug]
 * path param, which is fine for routing/display but never for choosing
 * which secret/order to trust), and the actual payment status always comes
 * from a fresh server-to-server call to Paystack's verify endpoint.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference") || "";
  if (!reference) return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });

  const tenantId = await getTenantIdByPaystackReference(reference);
  if (!tenantId) return NextResponse.json({ error: "Payment reference not found." }, { status: 404 });

  const paystack = await getTenantPaystackSetup(tenantId);
  if (!paystack) return NextResponse.json({ error: "This store's payment setup is unavailable." }, { status: 400 });

  const service = createServerSupabaseClient();

  const { data: intent, error: intentError } = await service
    .schema("store")
    .from("payment_intents")
    .select("order_id, amount")
    .eq("paystack_reference", reference)
    .single();

  if (intentError || !intent) {
    return NextResponse.json({ error: "Payment record not found." }, { status: 404 });
  }

  let verification;
  try {
    verification = await verifyTransaction({ secretKey: paystack.secretKey, reference });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to verify payment." },
      { status: 502 },
    );
  }

  if (verification.status === "success") {
    // Defence-in-depth: confirm Paystack actually charged what we asked for
    // before flipping the order to paid.
    if (verification.amountSubunit !== toSubunitAmount(Number(intent.amount))) {
      return NextResponse.json({ error: "Payment amount mismatch. Please contact support." }, { status: 409 });
    }

    const { error: markPaidError } = await service
      .schema("store")
      .rpc("mark_order_paid", { p_order_id: intent.order_id, p_paystack_reference: reference });

    if (markPaidError) {
      return NextResponse.json({ error: "Failed to finalize your order. Please contact support." }, { status: 500 });
    }
  } else {
    await service
      .schema("store")
      .from("payment_intents")
      .update({ status: verification.status })
      .eq("paystack_reference", reference);

    if (verification.status === "failed" || verification.status === "abandoned") {
      await service.schema("store").from("orders").update({ payment_status: "failed" }).eq("id", intent.order_id);
    }
  }

  const { data: order } = await service
    .schema("store")
    .from("orders")
    .select(
      "id, customer_name, customer_email, status, payment_status, total_amount, created_at, order_items(product_name, quantity, unit_price, line_total)",
    )
    .eq("id", intent.order_id)
    .single();

  return NextResponse.json({
    status: verification.status,
    order,
  });
}
