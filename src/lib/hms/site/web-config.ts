import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Settings for a hotel's online booking (instant or request-only, how a deposit is paid) and the
 * counts behind the staff screen: what visitors did and who left without booking. All of it reads
 * safely before the migration is run: the website then behaves as it always did (instant booking,
 * no counts).
 */

export type BookingMode = "instant" | "request";
export type WebConfig = { bookingMode: BookingMode; paymentNote: string | null; abandonedReminders: boolean };

export const DEFAULT_WEB_CONFIG: WebConfig = { bookingMode: "instant", paymentNote: null, abandonedReminders: true };

export async function getWebConfig(db: SupabaseClient, tenantId: string): Promise<WebConfig> {
  const { data, error } = await db.schema("hotel").from("sites").select("booking_mode,payment_note,abandoned_reminders").eq("tenant_id", tenantId).maybeSingle();
  if (error || !data) return DEFAULT_WEB_CONFIG;
  return {
    bookingMode: data.booking_mode === "request" ? "request" : "instant",
    paymentNote: (data.payment_note as string | null)?.trim() || null,
    abandonedReminders: data.abandoned_reminders !== false,
  };
}

export async function saveWebConfig(db: SupabaseClient, tenantId: string, changes: Partial<WebConfig>): Promise<{ ok: true } | { ok: false; error: string }> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.bookingMode) row.booking_mode = changes.bookingMode;
  if (changes.paymentNote !== undefined) row.payment_note = changes.paymentNote?.trim().slice(0, 800) || null;
  if (changes.abandonedReminders !== undefined) row.abandoned_reminders = changes.abandonedReminders;
  const { error } = await db.schema("hotel").from("sites").update(row).eq("tenant_id", tenantId);
  return error ? { ok: false, error: "The booking settings couldn't be saved. Has the website migration been run?" } : { ok: true };
}

export type FunnelStep = "search" | "sold_out" | "started" | "booked" | "request";

/** Notes that this visit reached a step. Once per visit and step; never throws, so it can't stop a booking. */
export async function logWebEvent(db: SupabaseClient, tenantId: string, visit: string | null | undefined, kind: FunnelStep) {
  const token = (visit ?? "").trim().slice(0, 80);
  if (token.length < 8) return;
  await db
    .schema("hotel")
    .from("website_events")
    .upsert({ tenant_id: tenantId, token, kind }, { onConflict: "tenant_id,token,kind", ignoreDuplicates: true })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Keeps what an abandoned-booking reminder needs for a visitor who has given an email. */
export async function saveWebSession(
  db: SupabaseClient,
  tenantId: string,
  input: { visit: string; email: string; firstName?: string; checkIn?: string; checkOut?: string; adults?: number; children?: number; rooms?: number; roomType?: string; ratePlan?: string },
) {
  const token = input.visit.trim().slice(0, 80);
  if (token.length < 8) return;
  const { data: existing } = await db.schema("hotel").from("website_booking_sessions").select("id,status").eq("tenant_id", tenantId).eq("token", token).maybeSingle();
  // Someone who already booked (or was reminded) isn't asked again in the same visit.
  if (existing && existing.status !== "started") return;
  const row = {
    tenant_id: tenantId,
    token,
    email: input.email.trim().toLowerCase().slice(0, 160),
    first_name: input.firstName?.trim().slice(0, 80) || null,
    check_in: input.checkIn || null,
    check_out: input.checkOut || null,
    adults: input.adults ?? null,
    children: input.children ?? null,
    rooms: input.rooms ?? null,
    room_type: input.roomType?.slice(0, 120) || null,
    rate_plan: input.ratePlan?.slice(0, 80) || null,
    updated_at: new Date().toISOString(),
  };
  await db.schema("hotel").from("website_booking_sessions").upsert(row, { onConflict: "tenant_id,token" });
  await logWebEvent(db, tenantId, token, "started");
}

export async function markWebSessionBooked(db: SupabaseClient, tenantId: string, visit: string | null | undefined, reservationId: string) {
  const token = (visit ?? "").trim().slice(0, 80);
  if (token.length < 8) return;
  await db
    .schema("hotel")
    .from("website_booking_sessions")
    .update({ status: "booked", reservation_id: reservationId, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("token", token)
    .then(
      () => undefined,
      () => undefined,
    );
}

export type WebFunnel = { days: number; searches: number; soldOut: number; started: number; booked: number; requests: number; abandoned: number; reminded: number };

export async function loadWebFunnel(db: SupabaseClient, tenantId: string, days = 30): Promise<WebFunnel> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const count = async (kind: FunnelStep) => {
    const { count: n } = await db.schema("hotel").from("website_events").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", kind).gte("created_at", since);
    return n ?? 0;
  };
  const sessions = async (status: string) => {
    const { count: n } = await db.schema("hotel").from("website_booking_sessions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", status).gte("created_at", since);
    return n ?? 0;
  };
  const [searches, soldOut, started, booked, requests, abandoned, reminded] = await Promise.all([
    count("search"),
    count("sold_out"),
    count("started"),
    count("booked"),
    count("request"),
    sessions("started"),
    sessions("reminded"),
  ]);
  return { days, searches, soldOut, started, booked, requests, abandoned, reminded };
}
