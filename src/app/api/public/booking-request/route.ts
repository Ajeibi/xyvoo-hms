import { NextResponse } from "next/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { bookingReference, bookingRequestSchema, guestEmail, hotelEmail } from "@/lib/hms/booking-request";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { hotelSlugForRequest, insertBookingRequest } from "@/lib/hms/site/booking";
import { getHotelSite } from "@/lib/hms/site/site";
import { websiteRateCheck } from "@/lib/hms/rates/website-check";
import { sendBookingRequestEmail } from "@/lib/mail/mailtrap";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST /api/public/booking-request
 *
 * Public booking-request endpoint for hotel websites. No payment and no automatic
 * reservation: the request is stored for the hotel (pending), the hotel's reservations
 * address is emailed (reply-to set to the guest) and the guest gets an acknowledgement
 * saying the stay is not yet confirmed. The hotel is the one whose website the request
 * came from, not one named in the body.
 */
export async function POST(request: Request) {
  const limit = await rateLimitShared(`booking-request:${clientIp(request)}`, 5, 10 * 60 * 1000);
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

  // Honeypot filled in: pretend success so bots learn nothing, but store and send nothing.
  if (req.company) return NextResponse.json({ ok: true, reference: bookingReference() });

  try {
    const hotelSlug = await hotelSlugForRequest(request);
    if (!hotelSlug) return NextResponse.json({ error: "Send the booking request from the hotel's website." }, { status: 400 });

    const tenant = await getHotelTenantBySlug(hotelSlug);
    const site = tenant ? await getHotelSite(tenant.id) : null;
    if (!tenant || !site) return NextResponse.json({ error: "Hotel not found." }, { status: 404 });

    // The page may name its hotel (older pages do); it has to be the one it was served for.
    const named = req.hotelSlug?.toLowerCase();
    if (named && named !== hotelSlug.toLowerCase() && named !== site.address) {
      return NextResponse.json({ error: "This request doesn't match the website it was sent from." }, { status: 400 });
    }

    // A draft site takes requests only from signed-in staff of that hotel (the preview).
    if (!site.published && "error" in (await requireHotelApiMember(hotelSlug))) {
      return NextResponse.json({ error: "Hotel not found." }, { status: 404 });
    }
    if (!site.reservationsEmail) {
      return NextResponse.json({ error: "This hotel can't take online booking requests yet. Please contact them directly." }, { status: 503 });
    }
    const hotelName = tenant.display_name?.trim() || tenant.name?.trim() || hotelSlug;

    // Store first, mail second: whatever happens to the emails, the hotel still has the request.
    const service = createServerSupabaseClient();
    const reference = await insertBookingRequest(service, { tenantId: tenant.id, request: req, templateId: site.templateId });

    // What the hotel's rate book says for this stay, beside what the guest was shown. It never blocks the request.
    const check = await websiteRateCheck(service, tenant, req).catch((error) => (console.error("[booking-request] rate check failed", error), null));
    const toHotel = hotelEmail(req, reference, hotelName, check?.rows ?? []);
    const toGuest = guestEmail(req, reference, hotelName);
    const hotelSent = await sendBookingRequestEmail({ to: site.reservationsEmail, replyTo: req.guest.email, ...toHotel }).then(
      () => true,
      (error) => (console.error("[booking-request] hotel email failed", { reference, error }), false),
    );
    if (hotelSent) {
      await service.schema("hotel").from("booking_requests").update({ hotel_emailed_at: new Date().toISOString() }).eq("tenant_id", tenant.id).eq("reference", reference);
    }
    await sendBookingRequestEmail({ to: req.guest.email, replyTo: site.reservationsEmail, ...toGuest }).catch((error) =>
      console.error("[booking-request] guest email failed", { reference, error }),
    );

    return NextResponse.json({ ok: true, reference });
  } catch (error) {
    console.error("[booking-request] failed", error);
    return NextResponse.json({ error: "We couldn't send your request. Please try again or contact the hotel directly." }, { status: 500 });
  }
}
