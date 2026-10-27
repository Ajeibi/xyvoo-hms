import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { confirmGuestStillHere, type ExtraNightReservation } from "@/lib/hms/folio-extra-nights";
import { loadFolioPayload, loadReservation } from "../../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
});

/** Staff confirm an overdue guest is still in the room, so the waiting extra nights are charged. */
export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const confirmed = await confirmGuestStillHere(auth.service, {
      tenantId: auth.tenant.id,
      reservation: reservation as ExtraNightReservation,
      pricing: normalizePricingSetup(auth.tenant.pricing_setup),
      postedBy: auth.user.id,
    });
    if (!confirmed.ok) return NextResponse.json({ error: confirmed.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_extra_nights_confirmed",
      entityType: "reservation",
      entityId: body.reservationId,
      after: { nights: confirmed.result.postedNights, amount: confirmed.result.postedAmount },
    });

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({
      ok: true,
      postedNights: confirmed.result.postedNights.length,
      postedAmount: confirmed.result.postedAmount,
      folio: payload?.folio,
      extraNights: payload?.extraNights,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not charge the extra nights." }, { status: 500 });
  }
}
