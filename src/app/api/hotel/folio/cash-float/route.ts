import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getActiveCashFloatSession, openCashFloatSession } from "@/lib/hms/folio";
import { notifyCashFloatVariance } from "@/lib/hms/notification-rules";

const OpenSchema = z.object({
  slug: z.string().min(1),
  action: z.literal("open"),
  openingBalance: z.coerce.number().min(0),
});

const CloseSchema = z.object({
  slug: z.string().min(1),
  action: z.literal("close"),
  closingBalance: z.coerce.number().min(0),
  notes: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const session = await getActiveCashFloatSession(auth.service, auth.tenant.id);
  return NextResponse.json({ session });
}

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const auth = await requireHotelApiMember(raw.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (raw.action === "open") {
      const body = OpenSchema.parse(raw);
      const existing = await getActiveCashFloatSession(auth.service, auth.tenant.id);
      if (existing) {
        return NextResponse.json({ error: "A cash float session is already open." }, { status: 409 });
      }
      const { session, error } = await openCashFloatSession(auth.service, {
        tenantId: auth.tenant.id,
        openedBy: auth.user.id,
        openingBalance: body.openingBalance,
      });
      if (!session) return NextResponse.json({ error: error ?? "Could not open session." }, { status: 500 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "cash_float_opened",
        entityType: "cash_float_session",
        entityId: session.id as string,
      });
      return NextResponse.json({ ok: true, session });
    }

    const body = CloseSchema.parse(raw);
    const session = await getActiveCashFloatSession(auth.service, auth.tenant.id);
    if (!session) return NextResponse.json({ error: "No open cash float session." }, { status: 404 });

    const { data: cashLines } = await auth.service
      .schema("hotel")
      .from("folio_transactions")
      .select("amount")
      .eq("cash_float_session_id", session.id)
      .eq("kind", "payment")
      .is("voided_at", null);

    const cashIn = (cashLines ?? []).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
    const expected = Number(session.opening_balance) + cashIn;
    const variance = body.closingBalance - expected;

    const { error } = await auth.service
      .schema("hotel")
      .from("cash_float_sessions")
      .update({
        closed_at: new Date().toISOString(),
        closed_by: auth.user.id,
        closing_balance: body.closingBalance,
        expected_balance: expected,
        variance,
        notes: body.notes ?? null,
      })
      .eq("id", session.id);

    if (error) return NextResponse.json({ error: "Could not close session." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "cash_float_closed",
      entityType: "cash_float_session",
      entityId: session.id as string,
      after: { variance, expected, closing: body.closingBalance },
    });

    if (Math.abs(variance) > 0.01) {
      await notifyCashFloatVariance({
        tenantId: auth.tenant.id,
        variance,
        entityId: session.id as string,
      });
    }

    return NextResponse.json({ ok: true, expected, variance });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
