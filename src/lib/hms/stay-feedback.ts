import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { phoneCountry } from "@/lib/hms/folio-invoice-link";
import { whatsappLink } from "@/lib/store/whatsapp";
import { loadStayRecipient } from "@/lib/hms/guest-messages";
import { feedbackMessage, type StayFeedback } from "@/lib/hms/stay-feedback-shared";

import { signFeedbackToken } from "@/lib/hms/stay-feedback-link";

export * from "@/lib/hms/stay-feedback-shared";
export { FEEDBACK_LINK_DAYS, signFeedbackToken, verifyFeedbackToken } from "@/lib/hms/stay-feedback-link";


type FeedbackRow = {
  id: string;
  reservation_id: string;
  guest_id: string | null;
  requested_at: string;
  requested_channel: string | null;
  submitted_at: string | null;
  overall: number | null;
  cleanliness: number | null;
  staff: number | null;
  value: number | null;
  would_recommend: boolean | null;
  comment: string | null;
};

const COLUMNS = "id,reservation_id,guest_id,requested_at,requested_channel,submitted_at,overall,cleanliness,staff,value,would_recommend,comment";

function mapFeedback(r: FeedbackRow, guestName = "Guest", roomCode: string | null = null): StayFeedback {
  return {
    id: r.id,
    reservationId: r.reservation_id,
    guestId: r.guest_id,
    guestName,
    roomCode,
    requestedAt: r.requested_at,
    requestedChannel: r.requested_channel,
    submittedAt: r.submitted_at,
    overall: r.overall,
    cleanliness: r.cleanliness,
    staff: r.staff,
    value: r.value,
    wouldRecommend: r.would_recommend,
    comment: r.comment,
  };
}

async function hotelName(db: SupabaseClient, tenantId: string) {
  const { data } = await db.from("tenants").select("name,display_name").eq("id", tenantId).maybeSingle();
  return (data?.display_name as string) || (data?.name as string) || "the hotel";
}

export type FeedbackRequestResult =
  | { ok: true; channel: "email" | "whatsapp"; link?: string; url: string }
  | { ok: false; error: string };

/**
 * Sends the guest their feedback link and notes that it was sent. Email goes out now; WhatsApp
 * gives a chat link for staff to open from the hotel's own number. Does nothing if the guest has
 * already answered.
 */
export async function requestStayFeedback(
  db: SupabaseClient,
  params: { tenantId: string; reservationId: string; channel: "email" | "whatsapp"; origin: string },
): Promise<FeedbackRequestResult> {
  const recipient = await loadStayRecipient(db, params.tenantId, params.reservationId);
  if (!recipient) return { ok: false, error: "Booking not found." };

  const { data: existing } = await db
    .schema("hotel")
    .from("stay_feedback")
    .select("id,submitted_at")
    .eq("tenant_id", params.tenantId)
    .eq("reservation_id", params.reservationId)
    .maybeSingle();
  if (existing?.submitted_at) return { ok: false, error: "This guest has already given feedback." };

  const to = params.channel === "email" ? recipient.email : recipient.whatsapp;
  if (!to) return { ok: false, error: params.channel === "email" ? "No email address on file." : "No phone number on file." };

  const hotel = await hotelName(db, params.tenantId);
  const url = `${params.origin}/feedback/${signFeedbackToken(params.tenantId, params.reservationId)}`;
  const now = new Date().toISOString();

  const row = { requested_at: now, requested_channel: params.channel, guest_id: recipient.guestId };
  const saved = existing
    ? await db.schema("hotel").from("stay_feedback").update(row).eq("id", existing.id)
    : await db.schema("hotel").from("stay_feedback").insert({ tenant_id: params.tenantId, reservation_id: params.reservationId, ...row });
  if (saved.error) {
    console.error("[feedback] save", saved.error.message);
    return { ok: false, error: "Could not record the request." };
  }

  if (params.channel === "whatsapp") {
    const { data: profile } = await db.schema("hotel").from("profiles").select("country").eq("tenant_id", params.tenantId).not("country", "is", null).limit(1).maybeSingle();
    const link = whatsappLink(to, feedbackMessage({ name: recipient.name, hotel, url }), phoneCountry(typeof profile?.country === "string" ? profile.country : null));
    if (!link) return { ok: false, error: "That phone number doesn't look right." };
    return { ok: true, channel: "whatsapp", link, url };
  }

  try {
    const text = feedbackMessage({ name: recipient.name, hotel, url });
    await sendBrandedEmail({
      to,
      subject: `How was your stay at ${hotel}?`,
      text,
      layout: {
        preheader: "It takes under a minute.",
        title: "How was your stay?",
        intro: `Thank you for staying at ${hotel}. Tell us how it went, in under a minute. Your answers help us look after the next guest better.`,
        buttons: [{ label: "Give feedback", href: url }],
        footerNote: `You are receiving this because you stayed at ${hotel}.`,
      },
    });
    return { ok: true, channel: "email", url };
  } catch (e) {
    console.error("[feedback] email", e);
    return { ok: false, error: "The email could not be sent." };
  }
}

/** What the guest sees when they open the link: the hotel and whether they have answered. */
export async function loadFeedbackForm(db: SupabaseClient, tenantId: string, reservationId: string) {
  const [hotel, recipient, { data }] = await Promise.all([
    hotelName(db, tenantId),
    loadStayRecipient(db, tenantId, reservationId),
    db.schema("hotel").from("stay_feedback").select("submitted_at").eq("tenant_id", tenantId).eq("reservation_id", reservationId).maybeSingle(),
  ]);
  if (!recipient) return null;
  return { hotel, guestName: recipient.name, answered: Boolean(data?.submitted_at) };
}

export type FeedbackAnswers = {
  overall: number;
  cleanliness: number | null;
  staff: number | null;
  value: number | null;
  wouldRecommend: boolean | null;
  comment: string | null;
};

/** Saves a guest's answers once. Returns false if they had already answered. */
export async function submitStayFeedback(db: SupabaseClient, params: { tenantId: string; reservationId: string; answers: FeedbackAnswers }) {
  const recipient = await loadStayRecipient(db, params.tenantId, params.reservationId);
  if (!recipient) return { ok: false as const, error: "Booking not found." };
  const { data: existing } = await db
    .schema("hotel")
    .from("stay_feedback")
    .select("id,submitted_at")
    .eq("tenant_id", params.tenantId)
    .eq("reservation_id", params.reservationId)
    .maybeSingle();
  if (existing?.submitted_at) return { ok: false as const, error: "You have already sent your feedback. Thank you." };

  const a = params.answers;
  const values = {
    guest_id: recipient.guestId,
    submitted_at: new Date().toISOString(),
    overall: a.overall,
    cleanliness: a.cleanliness,
    staff: a.staff,
    value: a.value,
    would_recommend: a.wouldRecommend,
    comment: a.comment,
  };
  const saved = existing
    ? await db.schema("hotel").from("stay_feedback").update(values).eq("id", existing.id)
    : await db.schema("hotel").from("stay_feedback").insert({ tenant_id: params.tenantId, reservation_id: params.reservationId, ...values });
  if (saved.error) {
    console.error("[feedback] submit", saved.error.message);
    return { ok: false as const, error: "Could not save your feedback. Please try again." };
  }
  return { ok: true as const, guestName: recipient.name, roomCode: recipient.roomCode };
}

type JoinedRow = FeedbackRow & {
  reservations?: { room_unit_id: string | null; reservation_guests?: { is_primary: boolean | null; guests: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null }[] | null } | null;
};

/** The hotel's latest feedback requests and answers, newest first. Empty if the table isn't there yet. */
export async function loadFeedback(db: SupabaseClient, tenantId: string, opts: { guestId?: string; limit?: number } = {}): Promise<StayFeedback[]> {
  let q = db
    .schema("hotel")
    .from("stay_feedback")
    .select(`${COLUMNS},reservations(room_unit_id,reservation_guests(is_primary,guests(first_name,last_name)))`)
    .eq("tenant_id", tenantId);
  if (opts.guestId) q = q.eq("guest_id", opts.guestId);
  const { data, error } = await q.order("requested_at", { ascending: false }).limit(opts.limit ?? 100);
  if (error || !data) return [];
  const rows = data as unknown as JoinedRow[];
  const unitIds = [...new Set(rows.map((r) => r.reservations?.room_unit_id).filter((x): x is string => Boolean(x)))];
  const codes = new Map<string, string>();
  if (unitIds.length > 0) {
    const { data: units } = await db.schema("hotel").from("room_units").select("id,room_code").eq("tenant_id", tenantId).in("id", unitIds);
    for (const u of units ?? []) codes.set(u.id as string, u.room_code as string);
  }
  return rows.map((r) => {
    const links = r.reservations?.reservation_guests ?? [];
    const link = links.find((l) => l.is_primary) ?? links[0];
    const g = (Array.isArray(link?.guests) ? link?.guests[0] : link?.guests) ?? {};
    const name = [g.first_name, g.last_name].filter(Boolean).join(" ") || "Guest";
    const unit = r.reservations?.room_unit_id;
    return mapFeedback(r, name, unit ? (codes.get(unit) ?? null) : null);
  });
}
