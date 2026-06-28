import { NextResponse } from "next/server";
import { VerifyPaymentSchema, validationError } from "../_lib";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { finalizePaystackPayment } from "@/lib/paystack/finalize";
import { getPaystackConfig } from "@/lib/paystack/config";

function platformSecretKey() {
  return process.env.PAYSTACK_PLATFORM_SECRET_KEY ?? null;
}

export async function POST(req: Request) {
  try {
    const body = VerifyPaymentSchema.parse(await req.json());
    const supabase = createServerSupabaseClient();

    const { data: intent } = await supabase
      .schema("hotel")
      .from("payment_intents")
      .select("tenant_id, purpose")
      .eq("paystack_reference", body.reference)
      .maybeSingle();

    if (!intent || intent.purpose !== "registration") {
      return NextResponse.json({ error: "Registration payment not found." }, { status: 404 });
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, paystack_setup")
      .eq("id", intent.tenant_id)
      .maybeSingle();

    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const tenantConfig = getPaystackConfig(tenant);
    const tenantForFinalize =
      tenantConfig.secretKey
        ? tenant
        : platformSecretKey()
          ? { ...tenant, paystack_setup: { ...tenantConfig, secretKey: platformSecretKey() } }
          : tenant;

    const result = await finalizePaystackPayment({
      supabase,
      tenant: tenantForFinalize,
      reference: body.reference,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await supabase
      .schema("hotel")
      .from("registration_sessions")
      .update({ metadata: { billing_paid: true, reference: body.reference } })
      .eq("tenant_id", intent.tenant_id);

    return NextResponse.json({ ok: true, intent: result.intent });
  } catch (error) {
    return validationError(error);
  }
}
