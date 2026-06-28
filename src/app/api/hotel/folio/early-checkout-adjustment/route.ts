import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { adjustFolioForEarlyCheckout } from "@/lib/hms/folio";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { loadFolioPayload } from "../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
});

/** Applies early-checkout folio credit when the guest is leaving before booked nights (idempotent). */
export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: reservation } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,status,nights,checked_in_at,departure_at")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", body.reservationId)
      .maybeSingle();

    if (!reservation || reservation.status !== "checked_in") {
      return NextResponse.json({ error: "No in-house stay found." }, { status: 404 });
    }
    if (!reservation.checked_in_at) {
      return NextResponse.json({ adjusted: false, folio: await loadFolioPayload(auth, body.reservationId) });
    }

    const currency = normalizePricingSetup(auth.tenant.pricing_setup).currency;
    const adjustment = await adjustFolioForEarlyCheckout(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      bookedNights: reservation.nights,
      checkedInAt: reservation.checked_in_at,
      checkoutAt: new Date(),
      postedBy: auth.user.id,
      currencyCode: currency,
    });

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({
      adjusted: adjustment.adjusted,
      unusedNights: adjustment.unusedNights,
      creditAmount: adjustment.creditAmount,
      actualNights: adjustment.actualNights,
      folio: payload?.folio,
      reservation: payload?.reservation,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not apply early checkout adjustment." }, { status: 500 });
  }
}
