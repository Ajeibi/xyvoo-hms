import type { SupabaseClient } from "@supabase/supabase-js";
import { setGuestConsent } from "@/lib/hms/guest-consent";
import { createReservation } from "@/lib/hms/reservation-create";
import { friendlyReservationError } from "@/lib/hms/reservation-availability-shared";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { storefrontUrl } from "@/lib/store/subdomain";
import { sendBookingRequestEmail } from "@/lib/mail/mailtrap";
import { logWebEvent, markWebSessionBooked, type WebConfig } from "./web-config";
import { sendWebConfirmation } from "./web-emails";
import { pickPlan, webOffer, type WebAlternative, type WebOffer, type WebTenant } from "./web-quote";
import { money2, splitGuests, stayDatesProblem, type WebBookingInput } from "./web-shared";

/*
 * Instant booking from the hotel's website. The page's price is never trusted: the stay is priced
 * again here by the rate book's function, and if the total is not the one the guest saw they are
 * asked again. Rooms are then booked with the front desk's own createReservation, so every rule of
 * a desk booking applies (occupancy, restrictions, the deposit and cancellation terms the booking
 * is made under). The database has the last word on the last room: the room type guard and the
 * website stock guard (migration 20261206100000) refuse the second guest, so two people booking
 * the final room at once can never both succeed.
 */

/** The website has no signed-in user. The booking and its audit entry carry no staff member. */
const WEB_ACTOR = null as unknown as string;

export type WebHotel = WebTenant & { name?: string | null; display_name?: string | null };
export type WebSiteInfo = { address: string | null; reservationsEmail: string | null };

export type WebBookingDone = {
  ok: true;
  /** True when this was a repeat of a booking already made with the same key. */
  replay: boolean;
  bookings: { code: string }[];
  total: number;
  deposit: { required: number; dueDate: string | null };
  paymentNote: string | null;
  currency: string;
  hotelName: string;
  roomName: string;
  planName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestEmail: string;
  addons: { name: string; amount: number }[];
  cancellation: string[];
  emailed: boolean;
};

export type WebBookingFailed =
  | { ok: false; code: "invalid" | "failed" | "busy"; error: string }
  | { ok: false; code: "unavailable"; error: string; alternatives: WebAlternative[] }
  | { ok: false; code: "restricted"; error: string }
  | { ok: false; code: "price_changed"; error: string; total: number; currency: string };

function todayInLagos() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}
export { todayInLagos };

const hotelNameOf = (t: WebHotel) => t.display_name?.trim() || t.name?.trim() || "the hotel";

/** Takes back rooms booked a moment ago when a later room in the same booking can't be had. */
async function undoRooms(db: SupabaseClient, tenantId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db
    .schema("hotel")
    .from("reservations")
    .update({ status: "cancelled", room_unit_id: null, cancel_reason: "The website could not book every room asked for, so none was kept." })
    .eq("tenant_id", tenantId)
    .in("id", ids);
}

async function describeBooked(db: SupabaseClient, tenant: WebHotel, config: WebConfig, ids: string[], extra: Pick<WebBookingDone, "addons" | "roomName" | "planName" | "cancellation">, replay: boolean): Promise<WebBookingDone | null> {
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,confirmation_code,arrival_at,departure_at,nights,room_type_code,deposit_required,deposit_due_date,pricing_snapshot,total_room_charges,reservation_guests(is_primary,guests(email))")
    .eq("tenant_id", tenant.id)
    .in("id", ids)
    .order("created_at", { ascending: true });
  if (!data?.length) return null;
  let total = 0;
  let deposit = 0;
  let dueDate: string | null = null;
  for (const r of data) {
    const snap = (r.pricing_snapshot ?? {}) as { taxes?: { grandTotal?: number } };
    total += Number(snap.taxes?.grandTotal) > 0 ? Number(snap.taxes!.grandTotal) : Number(r.total_room_charges) || 0;
    deposit += Number(r.deposit_required) || 0;
    dueDate = dueDate ?? ((r.deposit_due_date as string | null) ?? null);
  }
  const first = data[0];
  const links = (first.reservation_guests ?? []) as { is_primary: boolean; guests: { email: string | null } | { email: string | null }[] | null }[];
  const g = links[0]?.guests;
  const email = (Array.isArray(g) ? g[0]?.email : g?.email) ?? "";
  return {
    ok: true,
    replay,
    bookings: data.map((r) => ({ code: r.confirmation_code as string })),
    total: money2(total + extra.addons.reduce((s, a) => s + a.amount, 0)),
    deposit: { required: money2(deposit), dueDate },
    paymentNote: config.paymentNote,
    currency: normalizePricingSetup(tenant.pricing_setup).currency,
    hotelName: hotelNameOf(tenant),
    roomName: extra.roomName || normalizeRoomTypes(tenant.room_types).find((t) => t.id === first.room_type_code)?.name || "Room",
    planName: extra.planName || ((first.pricing_snapshot as { ratePlanName?: string } | null)?.ratePlanName ?? ""),
    checkIn: (first.arrival_at as string).slice(0, 10),
    checkOut: (first.departure_at as string).slice(0, 10),
    nights: Number(first.nights) || 1,
    guestEmail: email,
    addons: extra.addons,
    cancellation: extra.cancellation,
    emailed: false,
  };
}

export async function createWebBooking(
  db: SupabaseClient,
  tenant: WebHotel,
  site: WebSiteInfo,
  config: WebConfig,
  input: WebBookingInput,
): Promise<WebBookingDone | WebBookingFailed> {
  const today = todayInLagos();
  const problem = stayDatesProblem(input.checkIn, input.checkOut, today);
  if (problem) return { ok: false, code: "invalid", error: problem };

  // 1. Claim this submit. A second press of the button (or a retry) finds the claim and gets the first answer.
  const claim = await db.schema("hotel").from("website_booking_claims").insert({ tenant_id: tenant.id, claim_key: input.claimKey });
  const release = () => db.schema("hotel").from("website_booking_claims").delete().eq("tenant_id", tenant.id).eq("claim_key", input.claimKey).then(() => undefined, () => undefined);
  if (claim.error) {
    if (claim.error.code !== "23505") {
      console.error("[web-booking] claim failed", claim.error);
      return { ok: false, code: "failed", error: "Online booking isn't ready for this hotel yet. Please contact the hotel directly." };
    }
    const { data: earlier } = await db.schema("hotel").from("website_booking_claims").select("reservation_ids").eq("tenant_id", tenant.id).eq("claim_key", input.claimKey).maybeSingle();
    const ids = (earlier?.reservation_ids as string[] | undefined) ?? [];
    if (ids.length === 0) return { ok: false, code: "busy", error: "Your booking is still being made. Please wait a moment, then check your email." };
    const done = await describeBooked(db, tenant, config, ids, { addons: [], roomName: "", planName: "", cancellation: [] }, true);
    return done ?? { ok: false, code: "failed", error: "We couldn't find that booking. Please contact the hotel." };
  }

  try {
    // 2. Price it again, here.
    const stay = { checkIn: input.checkIn, checkOut: input.checkOut, adults: input.adults, children: input.children, rooms: input.rooms };
    const priced = await webOffer(db, tenant, stay, today, { withAlternatives: true });
    if (!priced.ok) {
      await release();
      return { ok: false, code: "invalid", error: priced.error };
    }
    const offer: WebOffer = priced.offer;
    const room = offer.roomTypes.find((r) => r.id === input.roomTypeCode);
    if (!room) {
      await release();
      return { ok: false, code: "invalid", error: "That room isn't on sale any more. Please choose again." };
    }
    if (!room.open) {
      await release();
      return { ok: false, code: "unavailable", error: `${room.name} has sold out for those dates.`, alternatives: room.alternatives };
    }
    const plan = pickPlan(room, input.ratePlan);
    if (!plan || !plan.bookable) {
      await release();
      return { ok: false, code: "restricted", error: plan?.reasons.join(" ") || "That rate can't be booked for those dates." };
    }
    const chosenAddons = input.addons.map((id) => offer.addons.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
    const addonsTotal = money2(chosenAddons.reduce((s, a) => s + a.amount, 0));
    const total = money2(plan.totalAllRooms + addonsTotal);
    if (input.expectedTotal !== undefined && Math.abs(input.expectedTotal - total) > 1) {
      await release();
      return { ok: false, code: "price_changed", error: "The price has changed since you chose your room. Please check the new total.", total, currency: offer.currency };
    }

    // 3. Book every room. If one fails, none is kept.
    const roomTypes = normalizeRoomTypes(tenant.room_types);
    const pricing = normalizePricingSetup(tenant.pricing_setup);
    const parties = splitGuests(input.adults, input.children, input.rooms);
    const notes = [input.arrivalTime ? `Expected arrival: ${input.arrivalTime}.` : "", input.requests ? `Guest request: ${input.requests}` : "", chosenAddons.length ? `Add-ons asked for on the website: ${chosenAddons.map((a) => a.name).join(", ")}.` : ""]
      .filter(Boolean)
      .join(" ");
    const made: { id: string; code: string; guestId: string }[] = [];
    for (const party of parties) {
      const result = await createReservation(db, {
        tenantId: tenant.id,
        userId: WEB_ACTOR,
        roomTypes,
        pricing,
        today,
        arrivalDay: input.checkIn,
        departureDay: input.checkOut,
        roomTypeCode: input.roomTypeCode,
        adults: party.adults,
        children: party.children,
        newGuest: { firstName: input.guest.firstName, lastName: input.guest.lastName, phone: input.guest.phone, email: input.guest.email },
        source: "website",
        bookingChannel: "Website",
        notes: notes || null,
        ratePlan: plan.code,
      });
      if (!result.ok) {
        await undoRooms(db, tenant.id, made.map((m) => m.id));
        await release();
        if (result.code === "type_full" || result.code === "room_taken") {
          const again = await webOffer(db, tenant, stay, today, { withAlternatives: true });
          const alternatives = again.ok ? (again.offer.roomTypes.find((r) => r.id === input.roomTypeCode)?.alternatives ?? []) : [];
          return { ok: false, code: "unavailable", error: `${room.name} has just sold out for those dates.`, alternatives };
        }
        if (result.code === "restricted") return { ok: false, code: "restricted", error: result.error };
        return { ok: false, code: "failed", error: friendlyReservationError(result.error)?.text ?? "We couldn't make your booking. Please try again or contact the hotel." };
      }
      made.push({ id: result.reservationId, code: result.confirmationCode, guestId: result.guestId });
    }

    const ids = made.map((m) => m.id);
    const ref = made[0].code;
    await db.schema("hotel").from("reservations").update({ web_booking_ref: ref }).eq("tenant_id", tenant.id).in("id", ids);
    await db.schema("hotel").from("website_booking_claims").update({ reservation_ids: ids }).eq("tenant_id", tenant.id).eq("claim_key", input.claimKey);

    // Add-ons are kept on the first room's booking for the front desk; nothing is charged online.
    if (chosenAddons.length) {
      await db
        .schema("hotel")
        .from("reservation_upsells")
        .insert(chosenAddons.map((a) => ({ tenant_id: tenant.id, reservation_id: ids[0], offer_id: a.id, kind: a.kind, name: a.name, amount: a.amount, accepted_by: null })))
        .then(
          () => undefined,
          (e) => console.warn("[web-booking] add-ons not saved", e),
        );
    }

    if (input.marketingOptIn) {
      await setGuestConsent(db, { tenantId: tenant.id, guestId: made[0].guestId, channel: "email", granted: true, source: "guest_link", note: "Ticked the box while booking on the hotel's website.", actorUserId: null }).catch(() => undefined);
    }
    await markWebSessionBooked(db, tenant.id, input.visit, ids[0]);
    await logWebEvent(db, tenant.id, input.visit, "booked");

    const done = await describeBooked(db, tenant, config, ids, { addons: chosenAddons.map((a) => ({ name: a.name, amount: a.amount })), roomName: room.name, planName: plan.name, cancellation: room.cancellation }, false);
    if (!done) return { ok: false, code: "failed", error: "Your booking was made but we couldn't show it. Check your email or contact the hotel." };

    // 4. Emails. A mail problem never undoes a booking.
    const manageBase = site.address ? storefrontUrl(site.address) : null;
    const party = (p: { adults: number; children: number }) => `${p.adults} adult${p.adults === 1 ? "" : "s"}${p.children ? `, ${p.children} child${p.children === 1 ? "" : "ren"}` : ""}`;
    let emailed = false;
    for (let i = 0; i < made.length; i++) {
      const sent = await sendWebConfirmation(db, {
        tenantId: tenant.id,
        reservationId: made[i].id,
        to: input.guest.email,
        guestName: input.guest.firstName,
        hotelName: done.hotelName,
        code: made[i].code,
        roomName: room.name,
        planName: plan.name,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: offer.nights,
        party: party(parties[i]),
        currency: offer.currency,
        total: plan.grandTotal + (i === 0 ? addonsTotal : 0),
        deposit: plan.deposit.required / input.rooms,
        depositDue: plan.deposit.dueDate,
        paymentNote: config.paymentNote,
        cancellation: room.cancellation,
        addons: i === 0 ? chosenAddons.map((a) => ({ name: a.name, amount: a.amount })) : [],
        manageUrl: manageBase ? `${manageBase}/manage-booking.html?ref=${encodeURIComponent(made[i].code)}` : null,
        replyTo: site.reservationsEmail,
        alsoBooked: made.filter((_, j) => j !== i).map((m) => m.code),
      });
      emailed = emailed || sent;
    }
    if (site.reservationsEmail) {
      const lines = [
        `New website booking ${ref}${made.length > 1 ? ` (${made.length} rooms)` : ""} for ${done.hotelName}. It is confirmed.`,
        "",
        `Guest: ${input.guest.firstName} ${input.guest.lastName}, ${input.guest.email}, ${input.guest.phone}`,
        `Room: ${room.name} × ${input.rooms} on ${plan.name}`,
        `Stay: ${input.checkIn} to ${input.checkOut} (${offer.nights} nights)`,
        `Total with taxes: ${done.total} ${offer.currency}`,
        done.deposit.required > 0 ? `Deposit asked: ${done.deposit.required}${done.deposit.dueDate ? `, by ${done.deposit.dueDate}` : ""}. Record it on the booking when it arrives.` : "No deposit asked.",
        chosenAddons.length ? `Add-ons: ${chosenAddons.map((a) => a.name).join(", ")}` : "",
        input.requests ? `Request: ${input.requests}` : "",
      ].filter(Boolean);
      await sendBookingRequestEmail({
        to: site.reservationsEmail,
        replyTo: input.guest.email,
        subject: `New website booking ${ref}: ${room.name}, ${input.checkIn}`,
        text: lines.join("\n"),
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5">${lines.map((l) => `<p style="margin:0 0 6px">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("")}</div>`,
      }).catch((e) => console.warn("[web-booking] hotel email failed", e));
    }
    return { ...done, emailed };
  } catch (error) {
    console.error("[web-booking] failed", error);
    await release();
    return { ok: false, code: "failed", error: "We couldn't make your booking. Please try again or contact the hotel." };
  }
}
