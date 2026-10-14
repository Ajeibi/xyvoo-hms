import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { isSimulatedIntent, SIMULATED_OUTCOMES, simulatedPaymentsEnabled } from "@/lib/payments/simulated";

const BodySchema = z.object({ reference: z.string().regex(/^[0-9a-f-]{36}$/i), outcome: z.enum(SIMULATED_OUTCOMES) });

/**
 * POST /api/shop/<store>/checkout/simulate { reference, outcome }: the pretend
 * gateway's "pay" button. Development only (see lib/payments/simulated).
 * It records what the shopper chose; the verify route then handles it exactly
 * as it handles a real Paystack answer.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!simulatedPaymentsEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the payment reference." }, { status: 400 });

  const slug = (await params).slug;
  const db = createServerSupabaseClient().schema("store");
  const [tenant, { data: intent }] = await Promise.all([
    /^[a-z0-9-]{1,63}$/i.test(slug) ? getShopTenantBySlug(slug) : Promise.resolve(null),
    db.from("payment_intents").select("tenant_id, metadata").eq("paystack_reference", parsed.data.reference).maybeSingle(),
  ]);
  if (!tenant || !intent || intent.tenant_id !== tenant.id || !isSimulatedIntent(intent.metadata)) {
    return NextResponse.json({ error: "Payment reference not found." }, { status: 404 });
  }
  const { error } = await db
    .from("payment_intents")
    .update({ metadata: { ...(intent.metadata as object), simulated_outcome: parsed.data.outcome } })
    .eq("paystack_reference", parsed.data.reference);
  if (error) return NextResponse.json({ error: "Couldn't record the payment." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
