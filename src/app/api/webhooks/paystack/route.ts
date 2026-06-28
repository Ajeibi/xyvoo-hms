import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPaystackConfig } from "@/lib/paystack/config";
import { finalizePaystackPayment, loadPaymentIntentByReference } from "@/lib/paystack/finalize";
import { verifyPaystackWebhookSignature } from "@/lib/paystack/verify-signature";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  let event: { event?: string; data?: { reference?: string; status?: string } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reference = event.data?.reference;
  if (!reference) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const service = createServerSupabaseClient();
  const intent = await loadPaymentIntentByReference(service, reference);
  if (!intent) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: tenant } = await service
    .from("tenants")
    .select("id, paystack_setup")
    .eq("id", intent.tenant_id)
    .maybeSingle();

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const config = getPaystackConfig(tenant);
  const secret = config.webhookSecret ?? config.secretKey;
  if (!secret || !verifyPaystackWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.event === "charge.success" || event.event === "charge.failed") {
    let folioNumber: string | null = null;
    if (intent.reservation_id) {
      const { data: resRow } = await service
        .schema("hotel")
        .from("reservations")
        .select("folio_number")
        .eq("id", intent.reservation_id)
        .maybeSingle();
      folioNumber = (resRow?.folio_number as string | null) ?? null;
    }

    if (event.event === "charge.success") {
      await finalizePaystackPayment({
        supabase: service,
        tenant,
        reference,
        actorUserId: intent.created_by,
        folioNumber,
      });
    } else {
      await service
        .schema("hotel")
        .from("payment_intents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", intent.id)
        .eq("status", "pending");
    }
  }

  if (event.event === "refund.processed" || event.event === "refund.failed") {
    const refundRef = event.data?.reference ?? reference;
    await service
      .schema("hotel")
      .from("folio_transactions")
      .update({
        status: event.event === "refund.processed" ? "posted" : "failed",
      })
      .eq("reference", refundRef)
      .eq("kind", "refund");
  }

  return NextResponse.json({ ok: true });
}
