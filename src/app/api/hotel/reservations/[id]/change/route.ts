import { NextResponse } from "next/server";
import { z } from "zod";
import { managerApproved, requireReservationsApi, todayDay } from "@/lib/hms/reservations-api";
import { changeReservation, describeChange } from "@/lib/hms/reservation-changes";
import { sendReservationEmail } from "@/lib/hms/reservation-emails";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";

/**
 * POST /api/hotel/reservations/:id/change — move a booking that hasn't arrived to other dates or
 * another room (the calendar, the booking page). `preview` only checks and prices it.
 * A room type that is full is refused unless a manager overrides it (their PIN, or an admin).
 */

const Body = z.object({
  slug: z.string().min(1),
  arrivalDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  departureDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  roomUnitId: z.string().uuid().nullable().optional(),
  preview: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
  overrideReason: z.string().trim().max(300).optional(),
  managerPin: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = Body.parse(await req.json());
    const auth = await requireReservationsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let overrideLimit: { reason: string } | null = null;
    if (body.overrideReason) {
      if (!(await managerApproved(auth, body.managerPin))) {
        return NextResponse.json({ error: body.managerPin ? "That manager PIN isn't right." : "Selling past the limit needs a manager's PIN.", requiresPin: true }, { status: 403 });
      }
      overrideLimit = { reason: body.overrideReason };
    }

    const result = await changeReservation(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: id,
      userId: auth.user.id,
      change: { arrivalDay: body.arrivalDay, departureDay: body.departureDay, roomUnitId: body.roomUnitId },
      roomTypes: normalizeRoomTypes(auth.tenant.room_types),
      pricing: normalizePricingSetup(auth.tenant.pricing_setup),
      today: todayDay(),
      preview: body.preview,
      overrideLimit,
    });

    if (!result.ok) {
      const status = result.code === "not_found" ? 404 : result.code === "room_taken" || result.code === "type_full" ? 409 : 400;
      return NextResponse.json({ error: result.error, code: result.code ?? null, canOverride: result.code === "type_full" }, { status });
    }

    const summary = describeChange(result);
    const payload = {
      ok: true,
      changes: summary,
      nights: result.plan.nights,
      oldTotal: result.plan.oldTotalRoom,
      newTotal: result.plan.newTotalRoom,
      roomCode: result.after.roomCode,
    };
    if (body.preview) return NextResponse.json(payload);

    let email: { status: string; reason?: string } | null = null;
    if (body.sendEmail !== false && result.plan.datesChanged) {
      const sent = await sendReservationEmail(auth.service, { tenantId: auth.tenant.id, reservationId: id, kind: "change", userId: auth.user.id, changes: summary });
      email = { status: sent.status, reason: sent.reason };
    }
    return NextResponse.json({ ...payload, email });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    console.error("[reservations change]", e);
    return NextResponse.json({ error: "The booking couldn't be changed." }, { status: 500 });
  }
}
