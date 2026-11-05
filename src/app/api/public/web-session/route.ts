import { NextResponse } from "next/server";
import { z } from "zod";
import { saveWebSession } from "@/lib/hms/site/web-config";
import { resolveWebHotel } from "@/lib/hms/site/web-context";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST /api/public/web-session
 *
 * The booking page tells us when a visitor has typed their email, with the stay they were looking at,
 * so one reminder can be sent if they leave without booking. Keeps nothing else about the visitor.
 */
const Body = z.object({
  visit: z.string().min(8).max(80),
  email: z.string().email().max(160),
  firstName: z.string().max(80).optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adults: z.coerce.number().int().min(1).max(12).optional(),
  children: z.coerce.number().int().min(0).max(12).optional(),
  rooms: z.coerce.number().int().min(1).max(6).optional(),
  roomType: z.string().max(120).optional(),
  ratePlan: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const limit = await rateLimitShared(`web-session:${clientIp(request)}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 422 });
  try {
    const hotel = await resolveWebHotel(request);
    if (!hotel.ok) return hotel.response;
    await saveWebSession(createServerSupabaseClient(), hotel.ctx.tenant.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[public web-session]", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
