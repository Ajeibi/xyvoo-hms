import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { phoneCountry } from "@/lib/hms/folio-invoice-link";
import { whatsappLink } from "@/lib/store/whatsapp";
import { loadStayRecipient } from "@/lib/hms/guest-messages";
import { signCheckInToken } from "@/lib/hms/online-checkin-link";
import {
  DEFAULT_DAYS_BEFORE,
  DEFAULT_ID_POLICY,
  ID_POLICIES,
  daysUntil,
  depositDue,
  idRequired,
  onlineCheckInDue,
  onlineCheckInMessage,
  type IdPolicy,
  type OnlineCheckIn,
} from "@/lib/hms/online-checkin-shared";

export * from "@/lib/hms/online-checkin-shared";
export { signCheckInToken, verifyCheckInToken } from "@/lib/hms/online-checkin-link";

export const SIGNATURE_BUCKET = "hotel-signatures";

/** A PNG signature sent from the browser as a data URL, decoded. Null if it isn't a plausible PNG. */
export function decodeSignature(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Uint8Array.from(Buffer.from(m[1], "base64"));
  const png = [0x89, 0x50, 0x4e, 0x47];
  if (bytes.length < 200 || bytes.length > 400_000 || png.some((b, i) => bytes[i] !== b)) return null;
  return bytes;
}

export type CheckInSettings = { idPolicy: IdPolicy; daysBefore: number };

/** The hotel's online check-in choices, or the defaults before they have made any. */
export async function loadCheckInSettings(db: SupabaseClient, tenantId: string): Promise<CheckInSettings> {
  const { data } = await db.schema("hotel").from("online_checkin_settings").select("id_policy,days_before").eq("tenant_id", tenantId).maybeSingle();
  const policy = data?.id_policy as string | undefined;
  return {
    idPolicy: (ID_POLICIES as readonly string[]).includes(policy ?? "") ? (policy as IdPolicy) : DEFAULT_ID_POLICY,
    daysBefore: Number(data?.days_before) || DEFAULT_DAYS_BEFORE,
  };
}

export async function saveCheckInSettings(db: SupabaseClient, tenantId: string, s: CheckInSettings) {
  const { error } = await db
    .schema("hotel")
    .from("online_checkin_settings")
    .upsert({ tenant_id: tenantId, id_policy: s.idPolicy, days_before: s.daysBefore, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

async function hotelInfo(db: SupabaseClient, tenantId: string) {
  const [{ data: tenant }, { data: profile }] = await Promise.all([
    db.from("tenants").select("name,display_name,room_types").eq("id", tenantId).maybeSingle(),
    db.schema("hotel").from("profiles").select("country").eq("tenant_id", tenantId).not("country", "is", null).limit(1).maybeSingle(),
  ]);
  const country = typeof profile?.country === "string" ? profile.country.trim() || null : null;
  return {
    name: (tenant?.display_name as string) || (tenant?.name as string) || "the hotel",
    country,
    countryCode: phoneCountry(country),
    roomTypeNames: new Map(
      (Array.isArray(tenant?.room_types) ? (tenant.room_types as { id?: string; name?: string }[]) : []).flatMap((t) => (t?.id && t?.name ? [[t.id, t.name] as const] : [])),
    ),
  };
}

type GuestEmbed = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; nationality: string | null };
type StayRow = {
  id: string;
  status: string;
  confirmation_code: string;
  arrival_at: string;
  departure_at: string;
  nights: number;
  adults: number;
  room_type_code: string;
  preauth_amount: number | string | null;
  reservation_guests?: { is_primary: boolean | null; guests: GuestEmbed | GuestEmbed[] | null }[] | null;
};

export type GuestStayView = {
  reservationId: string;
  status: string;
  confirmationCode: string;
  arrivalAt: string;
  departureAt: string;
  nights: number;
  adults: number;
  roomTypeCode: string;
  roomTypeName: string;
  guest: { id: string | null; name: string; email: string | null; phone: string | null; nationality: string | null };
  hotel: string;
  depositDue: number;
  idRequired: boolean;
  idPhotos: number;
};

/** What the guest sees on their check-in page. Null if the booking isn't there. */
export async function loadGuestStayView(db: SupabaseClient, tenantId: string, reservationId: string): Promise<GuestStayView | null> {
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,status,confirmation_code,arrival_at,departure_at,nights,adults,room_type_code,preauth_amount,reservation_guests(is_primary,guests(id,first_name,last_name,email,phone,nationality))")
    .eq("tenant_id", tenantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as StayRow;
  const links = r.reservation_guests ?? [];
  const link = links.find((l) => l.is_primary) ?? links[0];
  const g = (Array.isArray(link?.guests) ? link?.guests[0] : link?.guests) ?? null;

  const [hotel, settings, paid, photos] = await Promise.all([
    hotelInfo(db, tenantId),
    loadCheckInSettings(db, tenantId),
    db.schema("hotel").from("folio_transactions").select("amount").eq("tenant_id", tenantId).eq("reservation_id", reservationId).eq("kind", "payment").is("voided_at", null),
    db.schema("hotel").from("reservation_id_photos").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("reservation_id", reservationId),
  ]);
  const paidTotal = (paid.data ?? []).reduce((sum, p) => sum + Math.abs(Number(p.amount) || 0), 0);
  const nationality = g?.nationality?.trim() || null;
  return {
    reservationId: r.id,
    status: r.status,
    confirmationCode: r.confirmation_code,
    arrivalAt: r.arrival_at,
    departureAt: r.departure_at,
    nights: r.nights,
    adults: r.adults,
    roomTypeCode: r.room_type_code,
    roomTypeName: hotel.roomTypeNames.get(r.room_type_code) ?? r.room_type_code,
    guest: {
      id: g?.id ?? null,
      name: g ? `${g.first_name} ${g.last_name}`.trim() : "Guest",
      email: g?.email ?? null,
      phone: g?.phone ?? null,
      nationality,
    },
    hotel: hotel.name,
    depositDue: depositDue(r.preauth_amount != null ? Number(r.preauth_amount) : null, paidTotal),
    idRequired: idRequired(settings.idPolicy, nationality, hotel.countryCode),
    idPhotos: photos.count ?? 0,
  };
}

type CheckInRow = {
  requested_at: string;
  requested_channel: string | null;
  submitted_at: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  arrival_time: string | null;
  requests: string | null;
  id_required: boolean;
  signature_path: string | null;
};

const CHECKIN_COLUMNS = "requested_at,requested_channel,submitted_at,phone,email,nationality,arrival_time,requests,id_required,signature_path";

function mapCheckIn(row: CheckInRow | null, idPhotos: number): OnlineCheckIn {
  if (!row) {
    return { status: "not_sent", requestedAt: null, requestedChannel: null, submittedAt: null, phone: null, email: null, nationality: null, arrivalTime: null, requests: null, idRequired: false, signed: false, idPhotos };
  }
  return {
    status: row.submitted_at ? "completed" : "sent",
    requestedAt: row.requested_at,
    requestedChannel: row.requested_channel,
    submittedAt: row.submitted_at,
    phone: row.phone,
    email: row.email,
    nationality: row.nationality?.trim() || null,
    arrivalTime: row.arrival_time,
    requests: row.requests,
    idRequired: row.id_required,
    signed: Boolean(row.signature_path),
    idPhotos,
  };
}

/** A stay's online check-in state. Reads as "not sent" if the table isn't there yet. */
export async function loadOnlineCheckIn(db: SupabaseClient, tenantId: string, reservationId: string): Promise<OnlineCheckIn> {
  const [{ data }, photos] = await Promise.all([
    db.schema("hotel").from("online_checkins").select(CHECKIN_COLUMNS).eq("tenant_id", tenantId).eq("reservation_id", reservationId).maybeSingle(),
    db.schema("hotel").from("reservation_id_photos").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("reservation_id", reservationId),
  ]);
  return mapCheckIn((data as CheckInRow | null) ?? null, photos.count ?? 0);
}

export type CheckInRequestResult =
  | { ok: true; channel: "email" | "whatsapp"; link?: string; url: string }
  | { ok: false; error: string };

/** Sends the guest their check-in link: email now, or a WhatsApp chat for staff to open. */
export async function requestOnlineCheckIn(
  db: SupabaseClient,
  params: { tenantId: string; reservationId: string; channel: "email" | "whatsapp"; origin: string },
): Promise<CheckInRequestResult> {
  const stay = await loadGuestStayView(db, params.tenantId, params.reservationId);
  const recipient = await loadStayRecipient(db, params.tenantId, params.reservationId);
  if (!stay || !recipient) return { ok: false, error: "Booking not found." };
  if (stay.status !== "confirmed") return { ok: false, error: "Online check-in is only for bookings still to arrive." };

  const to = params.channel === "email" ? recipient.email : recipient.whatsapp;
  if (!to) return { ok: false, error: params.channel === "email" ? "No email address on file." : "No phone number on file." };

  const { data: existing } = await db
    .schema("hotel")
    .from("online_checkins")
    .select("id,submitted_at")
    .eq("tenant_id", params.tenantId)
    .eq("reservation_id", params.reservationId)
    .maybeSingle();
  if (existing?.submitted_at) return { ok: false, error: "This guest has already checked in online." };

  const hotel = await hotelInfo(db, params.tenantId);
  const url = `${params.origin}/check-in-online/${signCheckInToken(params.tenantId, params.reservationId)}`;
  const row = { requested_at: new Date().toISOString(), requested_channel: params.channel, guest_id: recipient.guestId };
  const saved = existing
    ? await db.schema("hotel").from("online_checkins").update(row).eq("id", existing.id)
    : await db.schema("hotel").from("online_checkins").insert({ tenant_id: params.tenantId, reservation_id: params.reservationId, ...row });
  if (saved.error) {
    console.error("[online check-in] save", saved.error.message);
    return { ok: false, error: "Could not record the request." };
  }

  const arrivalLabel = new Date(stay.arrivalAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const text = onlineCheckInMessage({ name: recipient.name, hotel: hotel.name, url, arrivalLabel });
  if (params.channel === "whatsapp") {
    const link = whatsappLink(to, text, hotel.countryCode);
    if (!link) return { ok: false, error: "That phone number doesn't look right." };
    return { ok: true, channel: "whatsapp", link, url };
  }
  try {
    await sendBrandedEmail({
      to,
      subject: `Check in online for your stay at ${hotel.name}`,
      text,
      layout: {
        preheader: `Arriving ${arrivalLabel}? Check in online and skip the paperwork.`,
        title: "Check in online",
        intro: `We look forward to welcoming you on ${arrivalLabel}. Confirm your details and sign online, so there is less to do at the desk.`,
        buttons: [{ label: "Check in online", href: url }],
        footerNote: `You are receiving this because you have a booking at ${hotel.name}.`,
      },
    });
    return { ok: true, channel: "email", url };
  } catch (e) {
    console.error("[online check-in] email", e);
    return { ok: false, error: "The email could not be sent." };
  }
}

export type CheckInAnswers = {
  phone: string;
  email: string | null;
  nationality: string;
  arrivalTime: string | null;
  requests: string | null;
  signature: Uint8Array;
};

/**
 * Saves the guest's online check-in: their details, their signature (a private image), and fills
 * in anything missing on their guest record. Fails if ID is required and not yet added.
 */
export async function submitOnlineCheckIn(db: SupabaseClient, params: { tenantId: string; reservationId: string; answers: CheckInAnswers }) {
  const stay = await loadGuestStayView(db, params.tenantId, params.reservationId);
  if (!stay) return { ok: false as const, error: "Booking not found." };
  if (stay.status !== "confirmed") return { ok: false as const, error: "This booking can no longer be checked in online." };
  const { data: existing } = await db
    .schema("hotel")
    .from("online_checkins")
    .select("id,submitted_at")
    .eq("tenant_id", params.tenantId)
    .eq("reservation_id", params.reservationId)
    .maybeSingle();
  if (existing?.submitted_at) return { ok: false as const, error: "You have already checked in online. Thank you." };

  const a = params.answers;
  // Whether ID is needed depends on where they say they are from.
  const settings = await loadCheckInSettings(db, params.tenantId);
  const hotel = await hotelInfo(db, params.tenantId);
  const needsId = idRequired(settings.idPolicy, a.nationality, hotel.countryCode);
  if (needsId && stay.idPhotos === 0) return { ok: false as const, error: "Please add a photo of your ID before you sign." };

  const path = `${params.tenantId}/${params.reservationId}/signature-${randomUUID()}.png`;
  let upload = await db.storage.from(SIGNATURE_BUCKET).upload(path, a.signature, { contentType: "image/png", upsert: false });
  if (upload.error && /bucket/i.test(upload.error.message)) {
    await db.storage.createBucket(SIGNATURE_BUCKET, { public: false }).catch(() => undefined);
    upload = await db.storage.from(SIGNATURE_BUCKET).upload(path, a.signature, { contentType: "image/png", upsert: false });
  }
  if (upload.error) {
    console.error("[online check-in] signature", upload.error.message);
    return { ok: false as const, error: "We couldn't save your signature just now. Please try again." };
  }

  const now = new Date().toISOString();
  const values = {
    guest_id: stay.guest.id,
    submitted_at: now,
    phone: a.phone,
    email: a.email,
    nationality: a.nationality,
    arrival_time: a.arrivalTime,
    requests: a.requests,
    id_required: needsId,
    signature_path: path,
    signed_at: now,
  };
  const saved = existing
    ? await db.schema("hotel").from("online_checkins").update(values).eq("id", existing.id)
    : await db.schema("hotel").from("online_checkins").insert({ tenant_id: params.tenantId, reservation_id: params.reservationId, requested_at: now, ...values });
  if (saved.error) {
    await db.storage.from(SIGNATURE_BUCKET).remove([path]).catch(() => undefined);
    console.error("[online check-in] save", saved.error.message);
    return { ok: false as const, error: "Could not save your check-in. Please try again." };
  }

  // What the hotel had blank is filled from what the guest wrote; nothing already on file is overwritten.
  if (stay.guest.id) {
    const fill: Record<string, string> = {};
    if (!stay.guest.phone && a.phone) fill.phone = a.phone;
    if (!stay.guest.email && a.email) fill.email = a.email;
    if (Object.keys(fill).length > 0) await db.schema("hotel").from("guests").update(fill).eq("tenant_id", params.tenantId).eq("id", stay.guest.id);
  }
  if (a.requests) {
    await db.schema("hotel").from("reservations").update({ guest_remarks: a.requests }).eq("tenant_id", params.tenantId).eq("id", params.reservationId).is("guest_remarks", null);
  }
  return { ok: true as const, signaturePath: path, guestName: stay.guest.name, signedAt: now };
}

export type UpcomingArrival = {
  reservationId: string;
  confirmationCode: string;
  guestName: string;
  arrivalAt: string;
  daysAway: number;
  status: OnlineCheckIn["status"];
  hasEmail: boolean;
  hasPhone: boolean;
  due: boolean;
};

/** Bookings arriving within the next `ahead` days, with where each one is in online check-in. */
export async function loadUpcomingArrivals(db: SupabaseClient, tenantId: string, daysBefore: number, ahead = 7): Promise<UpcomingArrival[]> {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + (ahead + 1) * 86400000);
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,confirmation_code,arrival_at,reservation_guests(is_primary,guests(first_name,last_name,email,phone,whatsapp))")
    .eq("tenant_id", tenantId)
    .eq("status", "confirmed")
    .gte("arrival_at", from.toISOString())
    .lt("arrival_at", to.toISOString())
    .order("arrival_at", { ascending: true })
    .limit(300);
  const rows = (data ?? []) as unknown as {
    id: string;
    confirmation_code: string;
    arrival_at: string;
    reservation_guests?: { is_primary: boolean | null; guests: { first_name: string; last_name: string; email: string | null; phone: string | null; whatsapp: string | null } | { first_name: string; last_name: string; email: string | null; phone: string | null; whatsapp: string | null }[] | null }[] | null;
  }[];
  if (rows.length === 0) return [];
  const { data: states } = await db.schema("hotel").from("online_checkins").select("reservation_id,submitted_at").eq("tenant_id", tenantId).in("reservation_id", rows.map((r) => r.id));
  const byId = new Map((states ?? []).map((s) => [s.reservation_id as string, s.submitted_at as string | null]));
  return rows.map((r) => {
    const links = r.reservation_guests ?? [];
    const link = links.find((l) => l.is_primary) ?? links[0];
    const g = Array.isArray(link?.guests) ? link?.guests[0] : link?.guests;
    return {
      reservationId: r.id,
      confirmationCode: r.confirmation_code,
      guestName: g ? `${g.first_name} ${g.last_name}`.trim() : "Guest",
      arrivalAt: r.arrival_at,
      daysAway: daysUntil(r.arrival_at),
      status: !byId.has(r.id) ? "not_sent" : byId.get(r.id) ? "completed" : "sent",
      hasEmail: Boolean(g?.email?.trim()),
      hasPhone: Boolean((g?.whatsapp || g?.phone)?.trim()),
      due: onlineCheckInDue(r.arrival_at, daysBefore),
    };
  });
}
