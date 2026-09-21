import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTenantIdByPaystackReference, getTenantPaystackSetup } from "@/lib/shop/tenants";
import { toSubunitAmount } from "@/lib/shop/checkout";
import { isValidWebhookSignature } from "@/lib/shop/paystack";

/**
 * One fixed URL serves every store tenant (each brings their own Paystack
 * account). The only way to know which tenant's webhookSecret to verify the
 * signature against is to look the reference up in our own records FIRST --
 * never trust tenant_id from the payload before the signature has passed.
 *
 * This is the async backup/confirmation path -- the shopper-facing
 * checkout/verify route is the primary one, since a shopper can close the
 * tab before Paystack redirects them back. Both call the same idempotent
 * mark_order_paid RPC, so whichever arrives first wins and the other is a
 * no-op.
 */
export async function POST(req: Request) {
  // Must read the raw, unparsed body -- HMAC-ing a re-stringified JSON
  // object will not reliably match Paystack's signature (key order/
  // whitespace won't round-trip identically).
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-paystack-signature");

  let payload: {
    event?: string;
    data?: { reference?: string; status?: string; amount?: number };
  } | null;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const reference = payload?.data?.reference;
  if (!reference) return NextResponse.json({ error: "Missing reference." }, { status: 400 });

  const tenantId = await getTenantIdByPaystackReference(reference);
  if (!tenantId) {
    // Not one of ours (or an unknown reference) -- acknowledge quietly
    // rather than give an attacker a way to probe which references exist.
    return NextResponse.json({ received: true });
  }

  const paystack = await getTenantPaystackSetup(tenantId);
  if (!paystack || !paystack.webhookSecret) {
    return NextResponse.json({ received: true });
  }

  if (!isValidWebhookSignature(rawBody, signatureHeader, paystack.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  if (payload?.event !== "charge.success" || payload.data?.status !== "success") {
    return NextResponse.json({ received: true });
  }

  const service = createServerSupabaseClient();

  const { data: intent } = await service
    .schema("store")
    .from("payment_intents")
    .select("order_id, amount")
    .eq("paystack_reference", reference)
    .single();

  if (!intent) return NextResponse.json({ received: true });

  // Defence-in-depth: cross-check the amount even after a valid signature.
  if (typeof payload.data?.amount === "number" && payload.data.amount !== toSubunitAmount(Number(intent.amount))) {
    return NextResponse.json({ error: "Amount mismatch." }, { status: 409 });
  }

  await service.schema("store").rpc("mark_order_paid", { p_order_id: intent.order_id, p_paystack_reference: reference });

  return NextResponse.json({ received: true });
}
