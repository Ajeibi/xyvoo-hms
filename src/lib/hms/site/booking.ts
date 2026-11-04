import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingReference, type BookingRequest } from "@/lib/hms/booking-request";
import { resolveSiteHost, type SiteHost } from "./host";

/**
 * Which hotel a booking request is for. It comes from where the request was made, never from the
 * body: the hotel's own address (<address>.getxyvoo.com), or, on the platform domain (the staff
 * draft preview, development), the /stay/<hotel>/ page the form was on.
 */
export async function hotelSlugForRequest(request: Request, resolve: (host: string | null) => Promise<SiteHost | null> = resolveSiteHost): Promise<string | null> {
  const site = await resolve(request.headers.get("host"));
  if (site?.kind === "hotel") return site.slug;
  if (site) return null;

  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.host !== request.headers.get("host")) return null;
    return url.pathname.match(/^\/stay\/([a-z0-9-]{1,63})(?:\/|$)/i)?.[1].toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Stores the request as pending, before anything is emailed, so a failed email never loses it. */
export async function insertBookingRequest(db: SupabaseClient, input: { tenantId: string; request: BookingRequest; templateId: string | null }) {
  const { request: req } = input;
  // `company` is the honeypot; real guests never fill it.
  const payload = { ...req };
  delete payload.company;

  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = bookingReference();
    const { error } = await db.schema("hotel").from("booking_requests").insert({
      tenant_id: input.tenantId,
      reference,
      status: "pending",
      check_in: req.checkIn,
      check_out: req.checkOut,
      adults: req.adults,
      children: req.children,
      rooms: req.rooms,
      room_type: req.room,
      rate_plan: req.ratePlan || null,
      extras: req.extras,
      estimated_total: req.estimatedTotal || null,
      guest_first_name: req.guest.firstName,
      guest_last_name: req.guest.lastName,
      guest_email: req.guest.email,
      guest_phone: req.guest.phone,
      arrival_time: req.arrivalTime || null,
      special_requests: req.requests || null,
      marketing_opt_in: req.marketingOptIn,
      payload,
      source_template_id: input.templateId,
    });
    if (!error) return reference;
    // 23505: the reference is already in use for this hotel; draw another.
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("Could not allocate a booking reference.");
}
