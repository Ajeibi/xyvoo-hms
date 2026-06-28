import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getActiveCashFloatSession, insertFolioLine, openCashFloatSession } from "@/lib/hms/folio";
import { notifyPaymentReceived } from "@/lib/hms/notification-rules";
import { loadFolioPayload, loadReservation } from "../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: z.enum(["cash", "card", "pos", "split", "direct_bill"]),
  reference: z.string().max(120).optional(),
  splitLeg: z.enum(["guest", "company"]).optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    let cashFloatSessionId: string | undefined;
    let cashFloatAutoOpened = false;
    if (body.method === "cash") {
      let session = await getActiveCashFloatSession(auth.service, auth.tenant.id);
      if (!session) {
        const opened = await openCashFloatSession(auth.service, {
          tenantId: auth.tenant.id,
          openedBy: auth.user.id,
          openingBalance: 0,
        });
        if (!opened.session) {
          return NextResponse.json(
            { error: opened.error ?? "Could not open cash float session." },
            { status: 500 },
          );
        }
        session = opened.session;
        cashFloatAutoOpened = true;
        await writeAuditLog({
          tenantId: auth.tenant.id,
          actorUserId: auth.user.id,
          action: "cash_float_opened",
          entityType: "cash_float_session",
          entityId: session.id as string,
          after: { openingBalance: 0, autoOpened: true },
        });
      }
      cashFloatSessionId = session.id as string;
    }

    const { line, error } = await insertFolioLine(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      kind: "payment",
      amount: body.amount,
      method: body.method,
      description: `Payment (${body.method})`,
      postedBy: auth.user.id,
      reference: body.reference,
      splitLeg: body.splitLeg ?? "guest",
      cashFloatSessionId,
    });
    if (error || !line) return NextResponse.json({ error: error ?? "Could not post payment." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_payment_posted",
      entityType: "folio_transaction",
      entityId: line.id,
      after: { amount: body.amount, method: body.method },
    });

    await notifyPaymentReceived({
      tenantId: auth.tenant.id,
      amount: body.amount,
      method: body.method,
      folioNumber: reservation.folio_number,
      entityId: line.id,
    });

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, line, folio: payload?.folio, cashFloatAutoOpened });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
