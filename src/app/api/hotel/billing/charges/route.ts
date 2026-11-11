import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { requireChargeAdmin } from "@/lib/hms/billing/access";
import { createCharge } from "@/lib/hms/billing/charges";
import "@/lib/hms/billing/kinds";
import { GatewayNotConfiguredError } from "@/lib/hms/billing/gateway";
import { ChargeRequestError, getChargeKind } from "@/lib/hms/billing/registry";
import { supabaseChargeStore } from "@/lib/hms/billing/store";
import { toPublicCharge } from "@/lib/hms/billing/types";

/** GET /api/hotel/billing/charges?slug= — the hotel's payments to XYVOO, newest first. Owner or admin. */
export async function GET(req: Request) {
  const result = await requireChargeAdmin(new URL(req.url).searchParams.get("slug") || "");
  if ("response" in result) return result.response;
  try {
    const rows = await supabaseChargeStore(result.auth.service).list(result.auth.tenant.id, 50);
    return NextResponse.json({ charges: rows.map(toPublicCharge) });
  } catch (error) {
    console.error("[platform charges GET]", error);
    return NextResponse.json({ error: "We couldn't load your payments." }, { status: 500 });
  }
}

const StartSchema = z.object({
  slug: z.string().min(1),
  kind: z.string().min(1).max(40),
  /** What to buy (e.g. which domain). The price is worked out on the server, never sent from here. */
  input: z.record(z.string(), z.unknown()).default({}),
});

/**
 * POST /api/hotel/billing/charges { slug, kind, input } — starts a payment to XYVOO and returns the
 * Paystack page to send the payer to. Owner or admin only.
 */
export async function POST(req: Request) {
  const parsed = StartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { slug, kind, input } = parsed.data;

  const result = await requireChargeAdmin(slug);
  if ("response" in result) return result.response;
  const { auth } = result;

  if (!rateLimit(`hotel-platform-charge:${auth.user.id}`, 10, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Too many attempts. Please try again in an hour." }, { status: 429 });
  }

  const definition = getChargeKind(kind);
  if (!definition) return NextResponse.json({ error: "That isn't something you can pay for here." }, { status: 400 });
  if (!auth.user.email) return NextResponse.json({ error: "Your account has no email address to send the receipt to." }, { status: 400 });

  try {
    const quote = await definition.quote({ tenantId: auth.tenant.id, input });
    const created = await createCharge({
      tenantId: auth.tenant.id,
      kind,
      amountKobo: quote.amountKobo,
      description: quote.description,
      metadata: quote.metadata,
      payerEmail: auth.user.email,
      createdBy: auth.user.id,
      origin: new URL(req.url).origin,
      slug,
    });
    return NextResponse.json({ authorizationUrl: created.authorizationUrl, reference: created.reference });
  } catch (error) {
    if (error instanceof ChargeRequestError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof GatewayNotConfiguredError) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error("[platform charges POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "We couldn't start the payment. Please try again." }, { status: 502 });
  }
}
