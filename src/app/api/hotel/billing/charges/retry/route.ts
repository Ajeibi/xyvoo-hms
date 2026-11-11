import { NextResponse } from "next/server";
import { z } from "zod";
import { requireChargeAdmin } from "@/lib/hms/billing/access";
import { retryDelivery } from "@/lib/hms/billing/charges";
import { toPublicCharge } from "@/lib/hms/billing/types";

const Schema = z.object({ slug: z.string().min(1), reference: z.string().min(1).max(100) });

/** POST /api/hotel/billing/charges/retry { slug, reference } — runs delivery again for a paid charge it failed on. */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const result = await requireChargeAdmin(parsed.data.slug);
  if ("response" in result) return result.response;

  try {
    const r = await retryDelivery(parsed.data.reference, result.auth.tenant.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
    return NextResponse.json({ charge: toPublicCharge(r.charge) });
  } catch (error) {
    console.error("[platform charge retry]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "We couldn't try again just now. Please retry in a moment." }, { status: 500 });
  }
}
