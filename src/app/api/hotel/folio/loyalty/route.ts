import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { getBillLoyalty, redeemPointsOnBill } from "@/lib/hms/guest-loyalty-bill";
import { loadFolioPayload, loadReservation } from "../_lib";

const PostSchema = z.object({ slug: z.string().min(1), reservationId: z.string().uuid(), points: z.coerce.number().int().positive() });

/** GET /api/hotel/folio/loyalty?slug=&reservationId=: the guest's points and how many can go on this bill. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "");
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const reservationId = z.string().uuid().parse(url.searchParams.get("reservationId"));
    const reservation = await loadReservation(auth, reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    return NextResponse.json(await getBillLoyalty(auth.service, auth.tenant.id, reservationId));
  } catch {
    return NextResponse.json({ error: "Could not load loyalty points." }, { status: 400 });
  }
}

/** POST /api/hotel/folio/loyalty: pay part of the bill with the guest's points. */
export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const result = await redeemPointsOnBill(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      actorUserId: auth.user.id,
      points: body.points,
      currency: normalizePricingSetup(auth.tenant.pricing_setup).currency,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, amount: result.amount, points: result.points, folio: payload?.folio });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not use the points." }, { status: 500 });
  }
}
