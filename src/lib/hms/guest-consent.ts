import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { ID_PHOTO_BUCKET } from "@/lib/hms/id-photos";
import {
  CONSENT_CHANNELS,
  NO_CONSENT,
  type ConsentChannel,
  type ConsentLogEntry,
  type ConsentSource,
  type ConsentState,
} from "@/lib/hms/guest-consent-shared";

/*
 * Marketing consent, data access and erasure (NDPA).
 *  - Consent is never assumed: every guest starts with none, and every change is added to a log
 *    that cannot be edited (the database refuses updates and deletes).
 *  - Access: a guest can ask for a copy of what the hotel holds on them; staff download it as a file.
 *  - Erasure: personal details are wiped. Stays and bills stay (with the guest shown as "Erased guest"),
 *    because hotels must keep their financial records.
 */

export async function getGuestConsent(
  service: SupabaseClient,
  tenantId: string,
  guestId: string,
): Promise<{ state: ConsentState; updatedAt: string | null; log: ConsentLogEntry[] }> {
  const { data: guest } = await service
    .schema("hotel")
    .from("guests")
    .select("marketing_email,marketing_sms,marketing_whatsapp,consent_updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", guestId)
    .maybeSingle();

  const { data: rows } = await service
    .schema("hotel")
    .from("guest_consent_log")
    .select("id,channel,granted,source,note,recorded_by,created_at")
    .eq("tenant_id", tenantId)
    .eq("guest_id", guestId)
    .order("created_at", { ascending: false })
    .limit(100);

  const authorIds = [...new Set((rows ?? []).map((r) => r.recorded_by as string | null).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await service.schema("hotel").from("profiles").select("user_id,contact_name").eq("tenant_id", tenantId).in("user_id", authorIds);
    for (const p of profiles ?? []) if (p.contact_name) names.set(p.user_id as string, p.contact_name as string);
  }

  return {
    state: guest
      ? { email: Boolean(guest.marketing_email), sms: Boolean(guest.marketing_sms), whatsapp: Boolean(guest.marketing_whatsapp) }
      : { ...NO_CONSENT },
    updatedAt: (guest?.consent_updated_at as string | null | undefined) ?? null,
    log: (rows ?? []).map((r) => ({
      id: r.id as string,
      channel: r.channel as ConsentChannel,
      granted: Boolean(r.granted),
      source: r.source as ConsentSource,
      note: (r.note as string | null) ?? null,
      recordedByName: r.recorded_by ? (names.get(r.recorded_by as string) ?? "Staff") : null,
      createdAt: r.created_at as string,
    })),
  };
}

/** Records one channel's consent being given or withdrawn, and updates the guest's current answer. */
export async function setGuestConsent(
  service: SupabaseClient,
  params: {
    tenantId: string;
    guestId: string;
    channel: ConsentChannel;
    granted: boolean;
    source: ConsentSource;
    note?: string | null;
    actorUserId: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: guest } = await service
    .schema("hotel")
    .from("guests")
    .select("id,anonymised_at")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.guestId)
    .maybeSingle();
  if (!guest) return { ok: false, error: "Guest not found." };
  if (guest.anonymised_at) return { ok: false, error: "This guest's details were erased." };

  const { error: logError } = await service.schema("hotel").from("guest_consent_log").insert({
    tenant_id: params.tenantId,
    guest_id: params.guestId,
    channel: params.channel,
    granted: params.granted,
    source: params.source,
    note: params.note?.trim() || null,
    recorded_by: params.actorUserId,
  });
  if (logError) return { ok: false, error: logError.message };

  const { error } = await service
    .schema("hotel")
    .from("guests")
    .update({ [`marketing_${params.channel}`]: params.granted, consent_updated_at: new Date().toISOString() })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.guestId);
  if (error) return { ok: false, error: error.message };

  if (params.actorUserId) {
    await writeAuditLog({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: params.granted ? "guest_consent_given" : "guest_consent_withdrawn",
      entityType: "guest",
      entityId: params.guestId,
      after: { channel: params.channel, source: params.source },
    });
  }
  return { ok: true };
}

/* ---------- The unsubscribe link ---------- */

function secret() {
  const key = process.env.HMS_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("No secret to sign unsubscribe links with.");
  return key;
}
const sign = (payload: string) => createHmac("sha256", `hms-unsubscribe:${secret()}`).update(payload).digest("base64url");

/** A link token that lets one guest turn off marketing from the hotel. It does not expire: an unsubscribe link must always work. */
export function signUnsubscribeToken(tenantId: string, guestId: string) {
  const payload = Buffer.from(`${tenantId}.${guestId}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): { tenantId: string; guestId: string } | null {
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [tenantId, guestId] = Buffer.from(payload, "base64url").toString().split(".");
  if (!tenantId || !guestId) return null;
  return { tenantId, guestId };
}

/** Turns every marketing channel off for the guest the token names. */
export async function unsubscribeGuest(service: SupabaseClient, token: string): Promise<{ ok: true; hotelName: string | null } | { ok: false }> {
  const v = verifyUnsubscribeToken(token);
  if (!v) return { ok: false };
  const current = await getGuestConsent(service, v.tenantId, v.guestId);
  for (const channel of CONSENT_CHANNELS) {
    if (!current.state[channel]) continue;
    const r = await setGuestConsent(service, {
      tenantId: v.tenantId,
      guestId: v.guestId,
      channel,
      granted: false,
      source: "unsubscribe",
      actorUserId: null,
    });
    if (!r.ok) return { ok: false };
  }
  const { data: tenant } = await service.from("tenants").select("name").eq("id", v.tenantId).maybeSingle();
  return { ok: true, hotelName: (tenant?.name as string | undefined) ?? null };
}

/* ---------- Access and erasure ---------- */

/** Everything the hotel holds about one guest, as a plain object a person can read. */
export async function exportGuestData(service: SupabaseClient, tenantId: string, guestId: string) {
  const db = service.schema("hotel");
  const { data: guest } = await db.from("guests").select("*").eq("tenant_id", tenantId).eq("id", guestId).maybeSingle();
  if (!guest) return null;

  const { data: links } = await db.from("reservation_guests").select("reservation_id,is_primary,relationship").eq("guest_id", guestId);
  const reservationIds = (links ?? []).map((l) => l.reservation_id as string);

  const [stays, notes, consent, loyalty, feedback, messages, requests] = await Promise.all([
    reservationIds.length
      ? db
          .from("reservations")
          .select("confirmation_code,status,arrival_at,departure_at,nights,adults,room_type_code,rate_per_night,total_room_charges,booking_channel,source,guest_remarks")
          .eq("tenant_id", tenantId)
          .in("id", reservationIds)
      : Promise.resolve({ data: [] }),
    db.from("guest_notes").select("note,created_at").eq("tenant_id", tenantId).eq("guest_id", guestId),
    db.from("guest_consent_log").select("channel,granted,source,note,created_at").eq("tenant_id", tenantId).eq("guest_id", guestId),
    db.from("guest_loyalty_ledger").select("points,kind,note,created_at").eq("tenant_id", tenantId).eq("guest_id", guestId),
    db.from("stay_feedback").select("*").eq("tenant_id", tenantId).eq("guest_id", guestId),
    db.from("guest_messages").select("channel,subject,body,status,created_at").eq("tenant_id", tenantId).eq("guest_id", guestId),
    reservationIds.length
      ? db.from("guest_requests").select("request_type,service_category,status,created_at").eq("tenant_id", tenantId).in("reservation_id", reservationIds)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    guest,
    stays: stays.data ?? [],
    notes: notes.data ?? [],
    consentHistory: consent.data ?? [],
    loyaltyPoints: loyalty.data ?? [],
    feedback: feedback.data ?? [],
    messagesSentToGuest: messages.data ?? [],
    serviceRequests: requests.data ?? [],
  };
}

/** Records that a guest asked for a copy of their data. */
export async function logDataRequest(
  service: SupabaseClient,
  params: { tenantId: string; guestId: string; guestName: string; kind: "access" | "erasure"; note?: string | null; actorUserId: string },
) {
  await service.schema("hotel").from("guest_data_requests").insert({
    tenant_id: params.tenantId,
    guest_id: params.guestId,
    guest_name: params.guestName,
    kind: params.kind,
    note: params.note?.trim() || null,
    requested_by: params.actorUserId,
  });
  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: params.kind === "access" ? "guest_data_exported" : "guest_data_erased",
    entityType: "guest",
    entityId: params.guestId,
  });
}

/**
 * Wipes a guest's personal details. Refused while they are in the hotel or have a booking coming
 * up, because the desk still needs to know who they are.
 */
export async function eraseGuest(
  service: SupabaseClient,
  params: { tenantId: string; guestId: string; actorUserId: string; note?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = service.schema("hotel");
  const { data: guest } = await db.from("guests").select("*").eq("tenant_id", params.tenantId).eq("id", params.guestId).maybeSingle();
  if (!guest) return { ok: false, error: "Guest not found." };
  if (guest.anonymised_at) return { ok: false, error: "This guest's details were already erased." };

  const { data: links } = await db.from("reservation_guests").select("reservation_id").eq("guest_id", params.guestId);
  const reservationIds = (links ?? []).map((l) => l.reservation_id as string);
  if (reservationIds.length > 0) {
    const { data: open } = await db
      .from("reservations")
      .select("confirmation_code,status")
      .eq("tenant_id", params.tenantId)
      .in("id", reservationIds)
      .in("status", ["confirmed", "checked_in"])
      .limit(1);
    if (open && open.length > 0) {
      return { ok: false, error: `They have booking ${open[0].confirmation_code} that is still open. Erase their details after they've checked out.` };
    }
  }

  const guestName = `${guest.first_name} ${guest.last_name}`.trim();

  // ID photos: the files, then the rows.
  const { data: photos } = await db.from("reservation_id_photos").select("storage_path").eq("tenant_id", params.tenantId).eq("guest_id", params.guestId);
  const paths = (photos ?? []).map((p) => p.storage_path as string);
  if (paths.length > 0) await service.storage.from(ID_PHOTO_BUCKET).remove(paths).catch(() => undefined);
  await db.from("reservation_id_photos").delete().eq("tenant_id", params.tenantId).eq("guest_id", params.guestId);

  await db.from("guest_notes").delete().eq("tenant_id", params.tenantId).eq("guest_id", params.guestId);

  // Anything we've said to or heard from them in their own words.
  await db.from("guest_messages").delete().eq("tenant_id", params.tenantId).eq("guest_id", params.guestId);

  // Withdraw every channel on the log first, so the history shows why they stopped.
  for (const channel of CONSENT_CHANNELS) {
    if (guest[`marketing_${channel}`]) {
      await db.from("guest_consent_log").insert({
        tenant_id: params.tenantId,
        guest_id: params.guestId,
        channel,
        granted: false,
        source: "erasure",
        recorded_by: params.actorUserId,
      });
    }
  }

  const { error } = await db
    .from("guests")
    .update({
      title: null,
      first_name: "Erased",
      last_name: "guest",
      nationality: "XX",
      id_number: "erased",
      id_expiry_date: "1900-01-01",
      date_of_birth: "1900-01-01",
      gender: "unspecified",
      phone: "",
      email: "",
      whatsapp: null,
      address: null,
      city: null,
      country: null,
      language: null,
      preferences: null,
      company_id: null,
      tags: [],
      accessibility_flags: [],
      marketing_email: false,
      marketing_sms: false,
      marketing_whatsapp: false,
      consent_updated_at: new Date().toISOString(),
      anonymised_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.guestId);
  if (error) return { ok: false, error: error.message };

  await logDataRequest(service, { ...params, guestName, kind: "erasure" });
  return { ok: true };
}
