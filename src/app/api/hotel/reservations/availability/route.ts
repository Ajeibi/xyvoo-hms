import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { availabilityByType, findFreeRooms, nightsBetweenDays } from "@/lib/hms/reservation-availability";
import { quoteStay } from "@/lib/hms/reservation-create";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { assertWithinRoomTypeOccupancy } from "@/lib/hms/walk-in-pricing";
import { todayDay } from "@/lib/hms/reservations-api";

/**
 * GET /api/hotel/reservations/availability?slug=&arrival=&departure=&adults=&children=
 * For each room type: rooms left on the tightest night, the overbooking allowance, the price of the
 * stay, the deposit it asks for, the cancellation terms and the rooms that are free to pick.
 */

const Query = z.object({
  slug: z.string().min(1),
  arrival: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departure: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(20).default(2),
  children: z.coerce.number().int().min(0).max(20).default(0),
  plan: z.string().max(80).optional(),
  company: z.string().uuid().optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = Query.parse(Object.fromEntries(url.searchParams));
    const auth = await requireHotelApiSection(q.slug, ["reservations", "frontdesk"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (q.departure <= q.arrival) return NextResponse.json({ error: "The guest must stay at least one night." }, { status: 400 });
    if (nightsBetweenDays(q.arrival, q.departure) > 365) return NextResponse.json({ error: "A booking can be at most 365 nights." }, { status: 400 });

    const roomTypes = normalizeRoomTypes(auth.tenant.room_types);
    const pricing = normalizePricingSetup(auth.tenant.pricing_setup);
    const [availability, freeRooms] = await Promise.all([
      availabilityByType(auth.service, { tenantId: auth.tenant.id, roomTypes, fromDay: q.arrival, toDay: q.departure }),
      findFreeRooms(auth.service, { tenantId: auth.tenant.id, fromDay: q.arrival, toDay: q.departure }),
    ]);

    const types = await Promise.all(
      roomTypes.map(async (t) => {
        const a = availability.find((x) => x.roomTypeCode === t.id);
        const quote = await quoteStay(auth.service, { tenantId: auth.tenant.id, roomType: t, pricing, arrivalDay: q.arrival, departureDay: q.departure, adults: q.adults, children: q.children, today: todayDay(), ratePlan: q.plan, arCustomerId: q.company });
        const fits = assertWithinRoomTypeOccupancy(t, q.adults, q.children, 0);
        return {
          id: t.id,
          name: t.name,
          maxOccupancy: t.maxOccupancy,
          fits: fits.ok,
          fitsMessage: fits.ok ? null : fits.message,
          roomsLeft: a?.minFree ?? 0,
          overbook: a?.overbook ?? 0,
          roomsLeftWithAllowance: a?.minFreeWithAllowance ?? 0,
          stock: a?.stock ?? 0,
          ratePlan: quote.plan,
          rateIssues: quote.issues.map((i) => i.message),
          nightly: quote.nightly,
          nightlyRate: quote.nightlyRate,
          roomTotal: quote.roomTotal,
          taxTotal: quote.taxTotal,
          grandTotal: quote.grandTotal,
          depositRequired: quote.depositRequired,
          depositDueDate: quote.depositDueDate,
          cancellationLines: quote.cancellationLines,
          freeRooms: freeRooms.filter((r) => r.roomTypeCode === t.id).map((r) => ({ id: r.id, roomCode: r.roomCode, floor: r.floor })),
        };
      }),
    );

    // Allotments that are open for this stay, so the booking can be made against one.
    const { data: allotments } = await auth.service
      .schema("hotel")
      .from("allotments")
      .select("id,name,room_type_code,rooms,start_date,end_date,release_date")
      .eq("tenant_id", auth.tenant.id)
      .eq("status", "active")
      .lte("start_date", q.arrival)
      .gte("end_date", q.departure);
    const today = todayDay();
    const openAllotments = (allotments ?? [])
      .filter((a) => !a.release_date || (a.release_date as string) > today)
      .map((a) => ({ id: a.id as string, name: a.name as string, roomTypeCode: a.room_type_code as string, rooms: a.rooms as number }));

    const { data: planRows } = await auth.service.schema("hotel").from("rate_plans").select("id,code,name,board_basis,refundable,ar_customer_id,is_default").eq("tenant_id", auth.tenant.id).eq("active", true).order("sort_order");
    const plans = (planRows ?? []).map((p) => ({ id: p.id as string, code: p.code as string, name: p.name as string, boardBasis: p.board_basis as string, refundable: p.refundable !== false, arCustomerId: (p.ar_customer_id as string | null) ?? null, isDefault: p.is_default === true }));

    return NextResponse.json({ currency: pricing.currency, plans, nights: nightsBetweenDays(q.arrival, q.departure), types, allotments: openAllotments });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Choose valid dates." }, { status: 400 });
    console.error("[reservations availability]", e);
    return NextResponse.json({ error: "Could not check availability." }, { status: 500 });
  }
}
