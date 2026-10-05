import { NextResponse } from "next/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { bookingReference, bookingRequestSchema, guestEmail, hotelEmail } from "@/lib/hms/booking-request";
import { sendBookingRequestEmail } from "@/lib/mail/mailtrap";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST /api/public/booking-request
 *
 * Public booking-request endpoint for hotel websites. No payment and no automatic
 * reservation: the hotel is emailed the request (reply-to set to the guest) and the
 * guest gets an acknowledgement saying the stay is not yet confirmed.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`booking-request:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many booking requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the booking request as JSON." }, { status: 400 });
  }

  const parsed = bookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields.",
        fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }
  const req = parsed.data;

  // Honeypot filled in: pretend success so bots learn nothing, but send nothing.
  if (req.company) return NextResponse.json({ ok: true, reference: bookingReference() });

  try {
    const tenant = await getHotelTenantBySlug(req.hotelSlug);
    if (!tenant) return NextResponse.json({ error: "Hotel not found." }, { status: 404 });
    const hotelName = tenant.display_name?.trim() || tenant.name?.trim() || req.hotelSlug;

    // Reservations go to the account owner's email until hotels have a dedicated
    // reservations address setting.
    const service = createServerSupabaseClient();
    const { data: profile } = await service
      .schema("hotel")
      .from("profiles")
      .select("user_id")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const ownerId = (profile as { user_id?: string } | null)?.user_id;
    const owner = ownerId ? await service.auth.admin.getUserById(ownerId) : null;
    const hotelInbox = owner?.data.user?.email;
    if (!hotelInbox) {
      return NextResponse.json({ error: "This hotel can't take online booking requests yet. Please contact them directly." }, { status: 503 });
    }

    const reference = bookingReference();
    const toHotel = hotelEmail(req, reference, hotelName);
    const toGuest = guestEmail(req, reference, hotelName);

    await sendBookingRequestEmail({ to: hotelInbox, replyTo: req.guest.email, ...toHotel });
    await sendBookingRequestEmail({ to: req.guest.email, replyTo: hotelInbox, ...toGuest });

    return NextResponse.json({ ok: true, reference });
  } catch {
    return NextResponse.json({ error: "We couldn't send your request. Please try again or contact the hotel directly." }, { status: 500 });
  }
}
