import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingSchema, validationError } from "../_lib";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HMS_CYCLES } from "@/constants/pricing";
import { paystackInitializeTransaction } from "@/lib/paystack/client";
import { getPaystackConfig, isPaystackReady } from "@/lib/paystack/config";
import { buildPaystackReference } from "@/lib/paystack/reference";

const PLAN_AMOUNTS: Record<string, number> = {
  monthly: 200_000,
  quarterly: 550_000,
  yearly: 2_000_000,
};

function platformPaystackKeys() {
  const publicKey = process.env.PAYSTACK_PLATFORM_PUBLIC_KEY;
  const secretKey = process.env.PAYSTACK_PLATFORM_SECRET_KEY;
  if (!publicKey || !secretKey) return null;
  return { publicKey, secretKey };
}

export async function POST(req: Request) {
  try {
    const body = BillingSchema.extend({ email: z.string().email() }).parse(await req.json());
    const supabase = createServerSupabaseClient();

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, paystack_setup")
      .eq("id", body.tenant_id)
      .maybeSingle();

    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const tenantConfig = getPaystackConfig(tenant);
    const platform = platformPaystackKeys();
    const useTenant = isPaystackReady(tenantConfig);
    const secretKey = useTenant ? tenantConfig.secretKey! : platform?.secretKey;
    const publicKey = useTenant ? tenantConfig.publicKey! : platform?.publicKey;

    if (!secretKey || !publicKey) {
      return NextResponse.json(
        { error: "Subscription payment is not configured. Start a free trial or contact support." },
        { status: 503 },
      );
    }

    const amount = PLAN_AMOUNTS[body.plan] ?? PLAN_AMOUNTS.monthly;

    const { data: intentRow, error: intentErr } = await supabase
      .schema("hotel")
      .from("payment_intents")
      .insert({
        tenant_id: tenant.id,
        reservation_id: null,
        amount,
        currency_code: "NGN",
        purpose: "registration",
        paystack_reference: "pending",
        status: "pending",
        metadata: { plan: body.plan, email: body.email },
      })
      .select("id")
      .single();

    if (intentErr || !intentRow) {
      return NextResponse.json({ error: intentErr?.message ?? "Could not create payment." }, { status: 500 });
    }

    const reference = buildPaystackReference(tenant.id, intentRow.id as string);
    await supabase
      .schema("hotel")
      .from("payment_intents")
      .update({ paystack_reference: reference })
      .eq("id", intentRow.id);

    const init = await paystackInitializeTransaction({
      secretKey,
      email: body.email,
      amount,
      currency: "NGN",
      reference,
      metadata: {
        tenant_id: tenant.id,
        intent_id: intentRow.id,
        purpose: "registration",
        plan: body.plan,
        plan_label: HMS_CYCLES.find((c) => c.id === body.plan)?.label ?? body.plan,
      },
    });

    if (!init.ok) {
      return NextResponse.json({ error: init.message }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      reference: init.result.reference,
      access_code: init.result.accessCode,
      authorization_url: init.result.authorizationUrl,
      public_key: publicKey,
      amount,
    });
  } catch (error) {
    return validationError(error);
  }
}
