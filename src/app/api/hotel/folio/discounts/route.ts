import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { insertFolioLine, verifyManagerPin } from "@/lib/hms/folio";
import { loadFolioPayload, loadReservation } from "../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  description: z.string().min(1).max(200),
  managerPin: z.string().optional(),
  splitLeg: z.enum(["guest", "company"]).optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const allowed = await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role);
    if (!allowed) return NextResponse.json({ error: "Manager PIN required." }, { status: 403 });

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const { line, error } = await insertFolioLine(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      kind: "discount",
      amount: -body.amount,
      method: "system",
      description: body.description,
      postedBy: auth.user.id,
      splitLeg: body.splitLeg ?? "guest",
    });
    if (error || !line) return NextResponse.json({ error: error ?? "Could not apply discount." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_discount_applied",
      entityType: "folio_transaction",
      entityId: line.id,
      after: { amount: body.amount },
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
