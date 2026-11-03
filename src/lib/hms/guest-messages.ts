import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { phoneCountry } from "@/lib/hms/folio-invoice-link";
import { whatsappLink } from "@/lib/store/whatsapp";
import {
  MAX_BROADCAST_GUESTS,
  personalise,
  type GuestMessageRow,
  type MessageChannel,
  type MessageRecipient,
  type MessageStatus,
} from "@/lib/hms/guest-messages-shared";

export * from "@/lib/hms/guest-messages-shared";

type GuestEmbed = { id?: string; first_name?: string; last_name?: string; title?: string; email?: string | null; phone?: string | null; whatsapp?: string | null };

type StayRow = {
  id: string;
  status: string;
  room_unit_id: string | null;
  reservation_guests?: { is_primary: boolean | null; guests: GuestEmbed | GuestEmbed[] | null }[] | null;
};

const STAY_COLUMNS =
  "id,status,room_unit_id,reservation_guests(is_primary,guests(id,first_name,last_name,title,email,phone,whatsapp))";

function recipientOf(r: StayRow, roomCode: string | null): MessageRecipient {
  const links = r.reservation_guests ?? [];
  const link = links.find((l) => l.is_primary) ?? links[0];
  const g = (Array.isArray(link?.guests) ? link?.guests[0] : link?.guests) ?? {};
  const name = [g.title, g.first_name, g.last_name].filter(Boolean).join(" ").trim() || "Guest";
  return {
    reservationId: r.id,
    guestId: g.id ?? null,
    name,
    roomCode,
    email: g.email?.trim() || null,
    whatsapp: g.whatsapp?.trim() || g.phone?.trim() || null,
  };
}

async function roomCodeMap(db: SupabaseClient, tenantId: string, rows: StayRow[]) {
  const ids = [...new Set(rows.map((r) => r.room_unit_id).filter((x): x is string => Boolean(x)))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await db.schema("hotel").from("room_units").select("id,room_code").eq("tenant_id", tenantId).in("id", ids);
  for (const u of data ?? []) map.set(u.id as string, u.room_code as string);
  return map;
}

/** Everyone in the house now, with how they can be reached. */
export async function loadInHouseRecipients(db: SupabaseClient, tenantId: string): Promise<MessageRecipient[]> {
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select(STAY_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "checked_in")
    .limit(500);
  const rows = (data ?? []) as unknown as StayRow[];
  const codes = await roomCodeMap(db, tenantId, rows);
  return rows
    .map((r) => recipientOf(r, r.room_unit_id ? (codes.get(r.room_unit_id) ?? null) : null))
    .sort((a, b) => (a.roomCode ?? "~").localeCompare(b.roomCode ?? "~", undefined, { numeric: true }));
}

/** One booking's guest, whether they are in the house or still to come. */
export async function loadStayRecipient(db: SupabaseClient, tenantId: string, reservationId: string): Promise<MessageRecipient | null> {
  const { data } = await db.schema("hotel").from("reservations").select(STAY_COLUMNS).eq("tenant_id", tenantId).eq("id", reservationId).maybeSingle();
  if (!data) return null;
  const row = data as unknown as StayRow;
  const codes = await roomCodeMap(db, tenantId, [row]);
  return recipientOf(row, row.room_unit_id ? (codes.get(row.room_unit_id) ?? null) : null);
}

export type SendOutcome = {
  reservationId: string;
  name: string;
  roomCode: string | null;
  status: MessageStatus;
  /** For WhatsApp: the chat to open. */
  link?: string;
  error?: string;
};

async function hotelDetails(db: SupabaseClient, tenantId: string) {
  const [{ data: tenant }, { data: profile }] = await Promise.all([
    db.from("tenants").select("name,display_name").eq("id", tenantId).maybeSingle(),
    db.schema("hotel").from("profiles").select("country").eq("tenant_id", tenantId).not("country", "is", null).limit(1).maybeSingle(),
  ]);
  return {
    name: (tenant?.display_name as string) || (tenant?.name as string) || "Hotel",
    country: typeof profile?.country === "string" ? profile.country.trim() || null : null,
  };
}

/**
 * Sends one message to each recipient and logs every one against its stay. Email goes out now; a
 * WhatsApp message becomes a chat link for staff to open from the hotel's own number, logged as
 * "prepared". A guest with no way to be reached on the chosen channel is logged as failed.
 */
export async function sendGuestMessages(
  db: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    channel: MessageChannel;
    subject: string;
    body: string;
    recipients: MessageRecipient[];
    broadcast: boolean;
  },
): Promise<SendOutcome[]> {
  const hotel = await hotelDetails(db, params.tenantId);
  const broadcastId = params.broadcast ? randomUUID() : null;
  const outcomes: SendOutcome[] = [];
  const logs: Record<string, unknown>[] = [];

  for (const r of params.recipients.slice(0, MAX_BROADCAST_GUESTS)) {
    const vars = { name: r.name, room: r.roomCode, hotel: hotel.name };
    const text = personalise(params.body, vars);
    const subject = personalise(params.subject, vars);
    let status: MessageStatus = "failed";
    let error: string | undefined;
    let link: string | undefined;
    const to = params.channel === "email" ? r.email : r.whatsapp;

    if (!to) {
      error = params.channel === "email" ? "No email address on file." : "No phone number on file.";
    } else if (params.channel === "email") {
      try {
        await sendBrandedEmail({
          to,
          subject,
          text,
          layout: { preheader: text.slice(0, 90), title: subject, intro: text, footerNote: `You are receiving this because you are staying at ${hotel.name}.` },
        });
        status = "sent";
      } catch (e) {
        console.error("[guest message] email", e);
        error = "The email could not be sent.";
      }
    } else {
      const l = whatsappLink(to, text, phoneCountry(hotel.country));
      if (l) {
        status = "prepared";
        link = l;
      } else {
        error = "That phone number doesn't look right.";
      }
    }

    outcomes.push({ reservationId: r.reservationId, name: r.name, roomCode: r.roomCode, status, ...(link ? { link } : {}), ...(error ? { error } : {}) });
    logs.push({
      tenant_id: params.tenantId,
      reservation_id: r.reservationId,
      guest_id: r.guestId,
      channel: params.channel,
      recipient: to,
      subject: params.channel === "email" ? subject : null,
      body: text,
      status,
      error: error ?? null,
      broadcast_id: broadcastId,
      sent_by: params.userId,
    });
  }

  if (logs.length > 0) {
    const { error } = await db.schema("hotel").from("guest_messages").insert(logs);
    if (error) console.error("[guest message] log", error.message);
  }
  return outcomes;
}

type MessageDbRow = {
  id: string;
  reservation_id: string;
  channel: string;
  recipient: string | null;
  subject: string | null;
  body: string;
  status: string;
  error: string | null;
  broadcast_id: string | null;
  created_at: string;
};

function mapRow(r: MessageDbRow): GuestMessageRow {
  return {
    id: r.id,
    reservationId: r.reservation_id,
    channel: r.channel === "whatsapp" ? "whatsapp" : "email",
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    status: r.status === "sent" || r.status === "prepared" ? r.status : "failed",
    error: r.error,
    broadcastId: r.broadcast_id,
    createdAt: r.created_at,
  };
}

/** Messages sent to a stay, newest first. Empty if the log table isn't there yet. */
export async function loadStayMessages(db: SupabaseClient, tenantId: string, reservationId: string): Promise<GuestMessageRow[]> {
  const { data, error } = await db
    .schema("hotel")
    .from("guest_messages")
    .select("id,reservation_id,channel,recipient,subject,body,status,error,broadcast_id,created_at")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data as MessageDbRow[]).map(mapRow);
}

/** The hotel's latest messages across all stays. */
export async function loadRecentMessages(db: SupabaseClient, tenantId: string): Promise<(GuestMessageRow & { guestName: string })[]> {
  const { data, error } = await db
    .schema("hotel")
    .from("guest_messages")
    .select("id,reservation_id,channel,recipient,subject,body,status,error,broadcast_id,created_at,reservations(reservation_guests(is_primary,guests(first_name,last_name)))")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error || !data) return [];
  return (data as unknown as (MessageDbRow & { reservations?: { reservation_guests?: StayRow["reservation_guests"] } | null })[]).map((r) => {
    const links = r.reservations?.reservation_guests ?? [];
    const link = links.find((l) => l.is_primary) ?? links[0];
    const g = (Array.isArray(link?.guests) ? link?.guests[0] : link?.guests) ?? {};
    return { ...mapRow(r), guestName: [g.first_name, g.last_name].filter(Boolean).join(" ") || "Guest" };
  });
}
