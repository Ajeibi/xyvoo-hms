import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getTenantFolioSettings, insertFolioLine } from "@/lib/hms/folio";
import { notifyLargeChargePosted } from "@/lib/hms/notification-rules";
import { loadFolioPayload, loadReservation } from "../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  description: z.string().min(1).max(200),
  department: z.string().max(60).optional(),
  splitLeg: z.enum(["guest", "company"]).optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const splitLeg =
      body.splitLeg ??
      (reservation.settlement_method === "direct_bill" ? "company" : "guest");

    const { line, error } = await insertFolioLine(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      kind: "charge",
      amount: body.amount,
      method: "system",
      description: body.description,
      department: body.department,
      postedBy: auth.user.id,
      splitLeg,
    });
    if (error || !line) return NextResponse.json({ error: error ?? "Could not post charge." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_charge_posted",
      entityType: "folio_transaction",
      entityId: line.id,
      after: { amount: body.amount, description: body.description },
    });

    const settings = await getTenantFolioSettings(auth.service, auth.tenant.id);
    if (body.amount >= settings.largeChargeThreshold) {
      await notifyLargeChargePosted({
        tenantId: auth.tenant.id,
        amount: body.amount,
        description: body.description,
        entityId: line.id,
      });
    }

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, line, folio: payload?.folio });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
