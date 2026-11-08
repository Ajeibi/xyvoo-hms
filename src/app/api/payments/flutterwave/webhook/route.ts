import { NextResponse } from "next/server";
import { getPaymentProvider, handlePaymentWebhook } from "@/lib/hms/integrations/payments/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST /api/payments/flutterwave/webhook: Flutterwave tells us a payment changed. Set this address and
 * the secret hash (FLUTTERWAVE_SECRET_HASH) on the Flutterwave dashboard. The signature is checked, then
 * Flutterwave is asked directly what happened, and the payment attempt is updated. Nothing is posted
 * to a guest bill. Answers 200 for anything that is not ours so Flutterwave stops resending it.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const outcome = await handlePaymentWebhook(createServerSupabaseClient(), req.headers, raw, getPaymentProvider("flutterwave"));
  switch (outcome.kind) {
    case "bad_signature":
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    case "retry":
      return NextResponse.json({ error: outcome.error }, { status: 503 });
    default:
      return NextResponse.json({ ok: true });
  }
}
