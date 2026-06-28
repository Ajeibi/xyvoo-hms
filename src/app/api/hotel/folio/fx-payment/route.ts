import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { insertFolioLine } from "@/lib/hms/folio";
import { notifyPaymentReceived } from "@/lib/hms/notification-rules";
import { loadFolioPayload, loadReservation } from "../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  amountLocal: z.coerce.number().positive(),
  originalAmount: z.coerce.number().positive(),
  originalCurrency: z.string().length(3),
  fxRate: z.coerce.number().positive(),
  method: z.enum(["cash", "card", "split", "direct_bill"]).default("cash"),
  reference: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const { line, error } = await insertFolioLine(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      kind: "payment",
      amount: body.amountLocal,
      method: body.method,
      description: `FX payment ${body.originalAmount} ${body.originalCurrency} @ ${body.fxRate}`,
      postedBy: auth.user.id,
      reference: body.reference,
      fxRate: body.fxRate,
      originalAmount: body.originalAmount,
      originalCurrency: body.originalCurrency,
    });
    if (error || !line) return NextResponse.json({ error: error ?? "Could not post payment." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_fx_payment_posted",
      entityType: "folio_transaction",
      entityId: line.id,
      after: { amountLocal: body.amountLocal, fxRate: body.fxRate },
    });

    await notifyPaymentReceived({
      tenantId: auth.tenant.id,
      amount: body.amountLocal,
      method: `${body.method} (FX)`,
      folioNumber: reservation.folio_number,
      entityId: line.id,
    });

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, line, folio: payload?.folio });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
