import { NextResponse } from "next/server";
import { z } from "zod";
import { requireChargeAdmin } from "@/lib/hms/billing/access";
import { verifyCharge } from "@/lib/hms/billing/charges";
import { supabaseChargeStore } from "@/lib/hms/billing/store";
import { toPublicCharge } from "@/lib/hms/billing/types";

const Schema = z.object({ slug: z.string().min(1), reference: z.string().min(1).max(100) });

/**
 * POST /api/hotel/billing/charges/verify { slug, reference } — the return page asks Paystack what
 * happened and records it. Safe to repeat. Only for a charge belonging to this hotel.
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const result = await requireChargeAdmin(parsed.data.slug);
  if ("response" in result) return result.response;
  const { auth } = result;

  const mine = await supabaseChargeStore(auth.service).byReference(parsed.data.reference);
  if (!mine || mine.tenantId !== auth.tenant.id) return NextResponse.json({ error: "We couldn't find that payment." }, { status: 404 });

  try {
    const r = await verifyCharge(parsed.data.reference);
    if (r.outcome === "unknown") return NextResponse.json({ error: "We couldn't find that payment." }, { status: 404 });
    return NextResponse.json({ outcome: r.outcome, charge: toPublicCharge(r.charge) });
  } catch (error) {
    console.error("[platform charge verify]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "We couldn't reach Paystack to check this payment. Please try again in a moment." }, { status: 502 });
  }
}
