import { NextResponse } from "next/server";
import { bookingReference } from "@/lib/hms/booking-request";
import { createWebBooking } from "@/lib/hms/site/web-booking";
import { getWebConfig } from "@/lib/hms/site/web-config";
import { resolveWebHotel } from "@/lib/hms/site/web-context";
import { webBookingSchema } from "@/lib/hms/site/web-shared";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST /api/public/book
 *
 * Books a stay from the hotel's website: prices it again on the server, makes a confirmed
 * reservation per room with the front desk's own booking function, and emails the guest.
 * Nothing is charged online. A hotel that prefers to approve each booking is on "request to book"
 * and this answers 409 `mode: "request"` so the page sends a request instead.
 */
export async function POST(request: Request) {
  const limit = await rateLimitShared(`web-book:${clientIp(request)}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many bookings from this connection. Please try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const body = await request.json().catch(() => null);
  const parsed = webBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the highlighted fields.", fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }
  const input = parsed.data;
  // Honeypot filled in: pretend it worked, keep nothing.
  if (input.company) return NextResponse.json({ ok: true, bookings: [{ code: bookingReference() }] });

  try {
    const hotel = await resolveWebHotel(request);
    if (!hotel.ok) return hotel.response;
    const { tenant, site } = hotel.ctx;
    const db = createServerSupabaseClient();
    const config = await getWebConfig(db, tenant.id);
    if (config.bookingMode === "request") {
      return NextResponse.json({ error: "This hotel confirms each booking itself. Your request will be sent to the team.", mode: "request" }, { status: 409 });
    }

    const result = await createWebBooking(db, tenant, { address: site.address, reservationsEmail: site.reservationsEmail }, config, input);
    if (result.ok) return NextResponse.json(result);
    const status = result.code === "invalid" ? 422 : result.code === "unavailable" || result.code === "price_changed" || result.code === "busy" ? 409 : result.code === "restricted" ? 422 : 500;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("[public book]", error);
    return NextResponse.json({ error: "We couldn't make your booking. Please try again or contact the hotel directly." }, { status: 500 });
  }
}
