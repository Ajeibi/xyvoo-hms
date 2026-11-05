import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveWebHotel } from "@/lib/hms/site/web-context";
import { todayInLagos } from "@/lib/hms/site/web-booking";
import { applyWebChange, cancelWebBooking, findWebBooking, previewWebChange, viewWebBooking } from "@/lib/hms/site/web-manage";
import { cleanCode } from "@/lib/hms/site/web-shared";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST /api/public/manage { action, code, email, ... }
 *
 * A guest looks after their own booking on the hotel's website. `lookup` shows it, `preview` prices
 * a change of dates, `change` makes it, `cancel` cancels it. The booking code and the email on the
 * booking must both match; anything else gets the same "not found" answer, so the route can't be
 * used to find out which codes exist.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lookup"), code: z.string().min(3).max(60), email: z.string().email().max(160) }),
  z.object({ action: z.literal("preview"), code: z.string().min(3).max(60), email: z.string().email().max(160), checkIn: day, checkOut: day }),
  z.object({ action: z.literal("change"), code: z.string().min(3).max(60), email: z.string().email().max(160), checkIn: day, checkOut: day }),
  z.object({ action: z.literal("cancel"), code: z.string().min(3).max(60), email: z.string().email().max(160) }),
]);

const NOT_FOUND = "We couldn't find a booking with that code and email. Check both and try again.";

export async function POST(request: Request) {
  // Strict: a person typing a code wrongly a few times is fine, a script guessing codes is not.
  const limit = await rateLimitShared(`web-manage:${clientIp(request)}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your booking code and the email on the booking." }, { status: 422 });
  const input = parsed.data;

  try {
    const hotel = await resolveWebHotel(request);
    if (!hotel.ok) return hotel.response;
    const { tenant } = hotel.ctx;
    const db = createServerSupabaseClient();
    const today = todayInLagos();

    const row = await findWebBooking(db, tenant.id, cleanCode(input.code), input.email);
    if (!row) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    if (input.action === "lookup") return NextResponse.json({ booking: await viewWebBooking(db, tenant, row, today) }, { headers: { "Cache-Control": "private, no-store" } });

    if (input.action === "preview") {
      const result = await previewWebChange(db, tenant, row, { checkIn: input.checkIn, checkOut: input.checkOut }, today);
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    }
    if (input.action === "change") {
      const result = await applyWebChange(db, tenant, row, { checkIn: input.checkIn, checkOut: input.checkOut }, today);
      if (!result.ok) return NextResponse.json(result, { status: 422 });
      const fresh = await findWebBooking(db, tenant.id, row.confirmation_code, input.email);
      return NextResponse.json({ ...result, booking: fresh ? await viewWebBooking(db, tenant, fresh, today) : null });
    }
    const result = await cancelWebBooking(db, tenant, row, today);
    if (!result.ok) return NextResponse.json(result, { status: 422 });
    const fresh = await findWebBooking(db, tenant.id, row.confirmation_code, input.email);
    return NextResponse.json({ ...result, booking: fresh ? await viewWebBooking(db, tenant, fresh, today) : null });
  } catch (error) {
    console.error("[public manage]", error);
    return NextResponse.json({ error: "Something went wrong. Please try again or contact the hotel." }, { status: 500 });
  }
}
