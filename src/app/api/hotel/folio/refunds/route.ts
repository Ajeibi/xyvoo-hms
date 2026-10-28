import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { FOLIO_WINDOWS, fetchFolioLines, verifyManagerPin } from "@/lib/hms/folio";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { REFUND_METHODS, recordFolioRefund } from "@/lib/hms/folio-refunds";
import { loadFolioPayload, loadReservation } from "../_lib";

/**
 * POST /api/hotel/folio/refunds — record money handed back from a guest's bill: cash from the
 * till, or a reversal on the card machine. Staff need a manager's PIN; owners and admins don't.
 */

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  amount: z.coerce.number().positive("Enter an amount above zero."),
  method: z.enum(REFUND_METHODS),
  posReference: z.string().max(60).optional(),
  reason: z.string().max(200),
  window: z.enum(FOLIO_WINDOWS).optional(),
  managerPin: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const allowed = await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role);
    if (!allowed) {
      return NextResponse.json(
        { error: body.managerPin ? "That manager PIN isn't right." : "Giving money back needs a manager's PIN.", requiresPin: true },
        { status: 403 },
      );
    }

    const result = await recordFolioRefund(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      lines: await fetchFolioLines(auth.service, auth.tenant.id, body.reservationId),
      request: { amount: body.amount, method: body.method, posReference: body.posReference, reason: body.reason, window: body.window },
      userId: auth.user.id,
      currency: normalizePricingSetup(auth.tenant.pricing_setup).currency,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_refund_recorded",
      entityType: "folio_transaction",
      entityId: result.lineId,
      after: { amount: body.amount, method: body.method, posReference: body.posReference ?? null, reason: body.reason, window: body.window ?? "guest" },
    });

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, cashFloatOpened: result.cashFloatOpened, folio: payload?.folio, stay: payload?.stay });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
