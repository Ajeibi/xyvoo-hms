import { NextResponse } from "next/server";
import { z } from "zod";
import { requireChargeAdmin } from "@/lib/hms/billing/access";
import { supabaseChargeStore } from "@/lib/hms/billing/store";
import { SIMULATED_OUTCOMES, simulatedPaymentsEnabled } from "@/lib/payments/simulated";

const Schema = z.object({ slug: z.string().min(1), reference: z.string().min(1).max(100), outcome: z.enum(SIMULATED_OUTCOMES) });

/**
 * POST /api/hotel/billing/charges/simulate { slug, reference, outcome } — the pretend gateway's "pay"
 * button. Development only (see lib/payments/simulated). It records the choice; verify then treats it
 * exactly like a real Paystack answer.
 */
export async function POST(req: Request) {
  if (!simulatedPaymentsEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const result = await requireChargeAdmin(parsed.data.slug);
  if ("response" in result) return result.response;
  const { auth } = result;

  const charge = await supabaseChargeStore(auth.service).byReference(parsed.data.reference);
  if (!charge || charge.tenantId !== auth.tenant.id || charge.metadata.simulated !== true || charge.status === "paid") {
    return NextResponse.json({ error: "We couldn't find that payment." }, { status: 404 });
  }
  const { error } = await auth.service
    .schema("hotel")
    .from("platform_charges")
    .update({ metadata: { ...charge.metadata, simulated_outcome: parsed.data.outcome }, updated_at: new Date().toISOString() })
    .eq("id", charge.id);
  if (error) return NextResponse.json({ error: "We couldn't record that." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
