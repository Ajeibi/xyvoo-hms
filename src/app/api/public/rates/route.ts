import { NextResponse } from "next/server";
import { z } from "zod";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { quoteStayAllPlans } from "@/lib/hms/rates/quote";
import { hotelSlugForRequest } from "@/lib/hms/site/booking";
import { getHotelSite } from "@/lib/hms/site/site";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /api/public/rates?checkin&checkout&adults&children
 *
 * What a hotel's own website can sell for a stay: every room type with the rate plans the hotel
 * sells on its website, priced night by night by the same function the front desk uses. The hotel
 * is the one whose website the request came from. Plans the website may not sell (switched off,
 * another channel, a company's rate) are left out; plans that break a restriction are listed but
 * not bookable, with the reason.
 */

const Query = z.object({
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(12).default(2),
  children: z.coerce.number().int().min(0).max(12).default(0),
});

const NOT_OFFERED = new Set(["plan_inactive", "plan_window", "plan_room_type", "plan_channel", "plan_company"]);

export async function GET(request: Request) {
  const limit = await rateLimitShared(`site-rates:${clientIp(request)}`, 60, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const url = new URL(request.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Choose your dates." }, { status: 422 });
  const q = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  if (q.checkin < today || q.checkout <= q.checkin) return NextResponse.json({ error: "Choose a check-out after your check-in, from today on." }, { status: 422 });
  if ((Date.parse(q.checkout) - Date.parse(q.checkin)) / 86_400_000 > 60) return NextResponse.json({ error: "For stays over 60 nights, please contact the hotel." }, { status: 422 });

  try {
    const hotelSlug = await hotelSlugForRequest(request);
    if (!hotelSlug) return NextResponse.json({ error: "Ask for rates from the hotel's website." }, { status: 400 });
    const tenant = await getHotelTenantBySlug(hotelSlug);
    const site = tenant ? await getHotelSite(tenant.id) : null;
    if (!tenant || !site) return NextResponse.json({ error: "Hotel not found." }, { status: 404 });
    if (!site.published && "error" in (await requireHotelApiMember(hotelSlug))) return NextResponse.json({ error: "Hotel not found." }, { status: 404 });

    const quote = await quoteStayAllPlans(createServerSupabaseClient(), tenant, {
      arrivalDay: q.checkin,
      departureDay: q.checkout,
      adults: q.adults,
      children: q.children,
      channel: "website",
    });
    if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: 400 });

    const pricing = normalizePricingSetup(tenant.pricing_setup);
    const roomTypes = quote.roomTypes.map((t) => ({
      id: t.roomTypeCode,
      name: t.roomTypeName,
      available: t.available,
      plans: t.plans
        .filter((p) => !p.issues.some((i) => NOT_OFFERED.has(i.kind)))
        .map((p) => ({
          code: p.planCode,
          name: p.planName,
          boardBasis: p.boardBasis,
          refundable: p.refundable,
          prepayRequired: p.prepayRequired,
          averageRate: p.averageRate,
          roomTotal: p.roomTotal,
          grandTotal: p.grandTotal,
          bookable: p.bookable,
          reasons: p.issues.map((i) => i.message),
        })),
    }));
    return NextResponse.json(
      { currency: pricing.currency, nights: quote.nights, roomTypes },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[public rates]", error);
    return NextResponse.json({ error: "We couldn't load the rates. Please try again." }, { status: 500 });
  }
}
