import { NextResponse } from "next/server";
import { z } from "zod";
import { managerApproved, requireReservationsApi, todayDay } from "@/lib/hms/reservations-api";
import { BOOKING_SOURCES, createReservation, MARKET_SEGMENTS } from "@/lib/hms/reservation-create";
import { sendReservationEmail } from "@/lib/hms/reservation-emails";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";

/**
 * POST /api/hotel/reservations — make a booking for a future stay.
 * A room type that is sold out is refused unless a manager overrides it (their PIN, or an admin).
 */

const Body = z.object({
  slug: z.string().min(1),
  arrivalDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the arrival date."),
  departureDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the departure date."),
  roomTypeCode: z.string().min(1, "Choose a room type."),
  roomUnitId: z.string().uuid().nullable().optional(),
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(20).default(0),
  guestId: z.string().uuid().nullable().optional(),
  newGuest: z
    .object({
      title: z.string().max(20).nullable().optional(),
      firstName: z.string().trim().min(1, "Enter the guest's first name.").max(80),
      lastName: z.string().trim().min(1, "Enter the guest's last name.").max(80),
      phone: z.string().trim().max(40).default(""),
      email: z.union([z.string().trim().email("Enter a valid email address.").max(160), z.literal("")]).default(""),
    })
    .nullable()
    .optional(),
  source: z.enum(BOOKING_SOURCES).default("phone"),
  marketSegment: z.enum(MARKET_SEGMENTS).optional(),
  purpose: z.enum(["leisure", "business", "transit"]).optional(),
  bookingChannel: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  vip: z.boolean().optional(),
  travelAgentId: z.string().uuid().nullable().optional(),
  allotmentId: z.string().uuid().nullable().optional(),
  sendEmail: z.boolean().optional(),
  overrideReason: z.string().trim().max(300).optional(),
  managerPin: z.string().optional(),
});

export async function POST(req: Request) {
  try {
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

    let groupBookingId: string | null = null;
    if (body.allotmentId) {
      const { data: a } = await auth.service.schema("hotel").from("allotments").select("id,group_booking_id,room_type_code,status").eq("tenant_id", auth.tenant.id).eq("id", body.allotmentId).maybeSingle();
      if (!a || a.status !== "active") return NextResponse.json({ error: "That allotment isn't open." }, { status: 400 });
      if (a.room_type_code !== body.roomTypeCode) return NextResponse.json({ error: "That allotment is for a different room type." }, { status: 400 });
      groupBookingId = (a.group_booking_id as string | null) ?? null;
    }

    const result = await createReservation(auth.service, {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      roomTypes: normalizeRoomTypes(auth.tenant.room_types),
      pricing: normalizePricingSetup(auth.tenant.pricing_setup),
      today: todayDay(),
      arrivalDay: body.arrivalDay,
      departureDay: body.departureDay,
      roomTypeCode: body.roomTypeCode,
      roomUnitId: body.roomUnitId,
      adults: body.adults,
      children: body.children,
      guestId: body.guestId,
      newGuest: body.newGuest ?? null,
      source: body.source,
      marketSegment: body.marketSegment,
      purpose: body.purpose,
      bookingChannel: body.bookingChannel,
      notes: body.notes,
      vip: body.vip,
      travelAgentId: body.travelAgentId,
      allotmentId: body.allotmentId,
      groupBookingId,
      overrideLimit,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code ?? null, canOverride: result.code === "type_full" }, { status: result.code ? 409 : 400 });
    }

    let email: { status: string; reason?: string } | null = null;
    if (body.sendEmail !== false) {
      const sent = await sendReservationEmail(auth.service, { tenantId: auth.tenant.id, reservationId: result.reservationId, kind: "confirmation", userId: auth.user.id });
      email = { status: sent.status, reason: sent.reason };
    }
    return NextResponse.json({ ok: true, reservationId: result.reservationId, confirmationCode: result.confirmationCode, matchedExistingGuest: result.matchedExistingGuest, grandTotal: result.grandTotal, email });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    console.error("[reservations create]", e);
    return NextResponse.json({ error: "The booking couldn't be made." }, { status: 500 });
  }
}
