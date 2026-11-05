import { NextResponse } from "next/server";
import { z } from "zod";
import { logWebEvent, getWebConfig } from "@/lib/hms/site/web-config";
import { resolveWebHotel } from "@/lib/hms/site/web-context";
import { todayInLagos } from "@/lib/hms/site/web-booking";
import { webOffer } from "@/lib/hms/site/web-quote";
import { MAX_WEB_ROOMS, stayDatesProblem } from "@/lib/hms/site/web-shared";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /api/public/rates?checkin&checkout&adults&children&rooms&visit
 *
 * What a hotel's own website can sell for a stay: every room type with how many are left, the rate
 * plans the hotel sells on its website priced night by night by the same function the front desk
 * uses (taxes and service charge included), the deposit and cancellation terms, the add-ons on
 * offer, and for a sold-out room type the nearest dates that are free. The hotel is the one whose
 * website the request came from. Plans that break a restriction are listed but not bookable, with
 * the reason.
 */

const Query = z.object({
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(12).default(2),
  children: z.coerce.number().int().min(0).max(12).default(0),
  rooms: z.coerce.number().int().min(1).max(MAX_WEB_ROOMS).default(1),
  visit: z.string().max(80).optional(),
});

export async function GET(request: Request) {
  const limit = await rateLimitShared(`site-rates:${clientIp(request)}`, 60, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Choose your dates." }, { status: 422 });
  const q = parsed.data;
  const problem = stayDatesProblem(q.checkin, q.checkout, todayInLagos());
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });

  try {
    const hotel = await resolveWebHotel(request);
    if (!hotel.ok) return hotel.response;
    const { tenant } = hotel.ctx;
    const db = createServerSupabaseClient();

    const result = await webOffer(db, tenant, { checkIn: q.checkin, checkOut: q.checkout, adults: q.adults, children: q.children, rooms: q.rooms }, todayInLagos(), { withAlternatives: true });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const config = await getWebConfig(db, tenant.id);

    // The funnel: this visit looked at prices, and whether everything was sold out.
    if (q.visit) {
      await logWebEvent(db, tenant.id, q.visit, "search");
      if (result.offer.roomTypes.length > 0 && result.offer.roomTypes.every((r) => !r.open)) await logWebEvent(db, tenant.id, q.visit, "sold_out");
    }

    return NextResponse.json({ ...result.offer, bookingMode: config.bookingMode, paymentNote: config.paymentNote }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[public rates]", error);
    return NextResponse.json({ error: "We couldn't load the rates. Please try again." }, { status: 500 });
  }
}
