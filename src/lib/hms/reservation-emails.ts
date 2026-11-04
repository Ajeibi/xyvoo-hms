import type { SupabaseClient } from "@supabase/supabase-js";
import { badge, detailsPanel, type BadgeTone } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { ANYTIME_CHECK_IN, formatPricingAmount, formatPricingTime, normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { describePolicy, policyFromSnapshot } from "@/lib/hms/reservation-cancellation-shared";
import { formatDayLong } from "@/lib/hms/reservation-availability-shared";

/*
 * Emails to the guest about a booking: confirmation when it is made, a change notice when its
 * dates or room change, and a cancellation notice. Each one is logged (sent, failed or skipped) so
 * staff can see what went out and send it again. A mail problem never stops a booking: it is
 * logged and the screen says so.
 */

export type ReservationEmailKind = "confirmation" | "change" | "cancellation";

export const EMAIL_KIND_LABEL: Record<ReservationEmailKind, string> = {
  confirmation: "Confirmation",
  change: "Change notice",
  cancellation: "Cancellation notice",
};

export type ReservationEmailSettings = {
  sendConfirmation: boolean;
  sendChange: boolean;
  sendCancellation: boolean;
  extraNote: string;
};

export const DEFAULT_EMAIL_SETTINGS: ReservationEmailSettings = { sendConfirmation: true, sendChange: true, sendCancellation: true, extraNote: "" };

export async function getReservationEmailSettings(db: SupabaseClient, tenantId: string): Promise<ReservationEmailSettings> {
  const { data } = await db
    .schema("hotel")
    .from("reservation_email_settings")
    .select("send_confirmation,send_change,send_cancellation,extra_note")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return DEFAULT_EMAIL_SETTINGS;
  return {
    sendConfirmation: data.send_confirmation !== false,
    sendChange: data.send_change !== false,
    sendCancellation: data.send_cancellation !== false,
    extraNote: (data.extra_note as string | null) ?? "",
  };
}

export async function saveReservationEmailSettings(
  db: SupabaseClient,
  params: { tenantId: string; userId: string; settings: ReservationEmailSettings },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db
    .schema("hotel")
    .from("reservation_email_settings")
    .upsert(
      {
        tenant_id: params.tenantId,
        send_confirmation: params.settings.sendConfirmation,
        send_change: params.settings.sendChange,
        send_cancellation: params.settings.sendCancellation,
        extra_note: params.settings.extraNote.trim().slice(0, 600) || null,
        updated_by: params.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
  return error ? { ok: false, error: "The email settings couldn't be saved." } : { ok: true };
}

export type ReservationEmailLogRow = { id: string; kind: ReservationEmailKind; to: string | null; subject: string | null; status: "sent" | "failed" | "skipped"; error: string | null; createdAt: string };

export async function listReservationEmails(db: SupabaseClient, tenantId: string, reservationId: string): Promise<ReservationEmailLogRow[]> {
  const { data } = await db
    .schema("hotel")
    .from("reservation_emails")
    .select("id,kind,to_email,subject,status,error,created_at")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as ReservationEmailKind,
    to: (r.to_email as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    status: r.status as "sent" | "failed" | "skipped",
    error: (r.error as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

const COLUMNS =
  "id,confirmation_code,status,arrival_at,departure_at,nights,adults,children_json,room_type_code,room_unit_id,total_room_charges,pricing_snapshot,cancellation_policy,cancellation_fee,cancellation_fee_status,deposit_required,deposit_due_date,reservation_guests(is_primary,guests(title,first_name,last_name,email))";

type GuestEmbed = { title: string | null; first_name: string; last_name: string; email: string | null };

export type ReservationEmailResult = { ok: boolean; status: "sent" | "failed" | "skipped"; reason?: string; to?: string | null };

function childCount(json: unknown) {
  return Array.isArray(json) ? json.length : 0;
}

export async function sendReservationEmail(
  db: SupabaseClient,
  params: {
    tenantId: string;
    reservationId: string;
    kind: ReservationEmailKind;
    userId?: string | null;
    /** Send even if the hotel has switched this email off (a manual resend). */
    force?: boolean;
    /** For a change notice: what changed, in plain words. */
    changes?: string[];
  },
): Promise<ReservationEmailResult> {
  const log = async (status: "sent" | "failed" | "skipped", to: string | null, subject: string | null, error?: string) => {
    await db
      .schema("hotel")
      .from("reservation_emails")
      .insert({ tenant_id: params.tenantId, reservation_id: params.reservationId, kind: params.kind, to_email: to, subject, status, error: error ?? null, sent_by: params.userId ?? null });
  };

  try {
    const [{ data: res }, { data: tenant }, settings] = await Promise.all([
      db.schema("hotel").from("reservations").select(COLUMNS).eq("tenant_id", params.tenantId).eq("id", params.reservationId).maybeSingle(),
      db.from("tenants").select("name,display_name,pricing_setup,room_types").eq("id", params.tenantId).maybeSingle(),
      getReservationEmailSettings(db, params.tenantId),
    ]);
    if (!res) return { ok: false, status: "failed", reason: "Booking not found." };

    const enabled = params.kind === "confirmation" ? settings.sendConfirmation : params.kind === "change" ? settings.sendChange : settings.sendCancellation;
    const links = (res.reservation_guests ?? []) as { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[];
    const primary = links.find((l) => l.is_primary) ?? links[0];
    const g = Array.isArray(primary?.guests) ? primary?.guests[0] : primary?.guests;
    const to = g?.email?.trim() || null;

    if (!enabled && !params.force) {
      await log("skipped", to, null, "This email is switched off in reservation settings.");
      return { ok: true, status: "skipped", reason: "This email is switched off in reservation settings.", to };
    }
    if (!to) {
      await log("skipped", null, null, "The guest has no email address.");
      return { ok: false, status: "skipped", reason: "The guest has no email address.", to: null };
    }

    const hotel = (tenant?.display_name as string) || (tenant?.name as string) || "the hotel";
    const pricing = normalizePricingSetup(tenant?.pricing_setup);
    const currency = pricing.currency;
    const roomType = normalizeRoomTypes(tenant?.room_types).find((t) => t.id === res.room_type_code);
    const snapshot = (res.pricing_snapshot && typeof res.pricing_snapshot === "object" ? res.pricing_snapshot : {}) as { taxes?: { grandTotal?: number } };
    const total = Number(snapshot.taxes?.grandTotal) > 0 ? Number(snapshot.taxes!.grandTotal) : Number(res.total_room_charges) || 0;
    const name = g ? `${g.title ? `${g.title} ` : ""}${g.first_name} ${g.last_name}`.trim() : "Guest";
    const arrival = (res.arrival_at as string).slice(0, 10);
    const departure = (res.departure_at as string).slice(0, 10);
    const nights = Number(res.nights) || 1;
    const children = childCount(res.children_json);
    const party = `${res.adults} adult${Number(res.adults) === 1 ? "" : "s"}${children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}`;
    const code = res.confirmation_code as string;
    const checkInNote = pricing.checkInTime && pricing.checkInTime !== ANYTIME_CHECK_IN ? ` (check-in from ${formatPricingTime(pricing.checkInTime)})` : "";
    const checkOutNote = pricing.checkOutTime ? ` (check-out by ${formatPricingTime(pricing.checkOutTime)})` : "";

    const rows = [
      { label: "Booking", value: code },
      { label: "Arrival", value: `${formatDayLong(arrival)}${checkInNote}` },
      { label: "Departure", value: `${formatDayLong(departure)}${checkOutNote}` },
      { label: "Nights", value: String(nights) },
      { label: "Room", value: roomType?.name ?? "Room" },
      { label: "Guests", value: party },
    ];

    const policy = policyFromSnapshot(res.cancellation_policy);
    const policyLines = policy ? describePolicy(policy, currency) : [];

    let subject: string;
    let title: string;
    let intro: string;
    let tone: BadgeTone = "blue";
    let badgeLabel: string;
    const textLines: string[] = [];
    const extra: string[] = [];

    if (params.kind === "confirmation") {
      subject = `Your booking at ${hotel} is confirmed (${code})`;
      title = "Your booking is confirmed";
      intro = `Hello ${name}, thank you for booking with ${hotel}. We look forward to welcoming you.`;
      badgeLabel = "Confirmed";
      tone = "green";
      rows.push({ label: "Total for the stay", value: `${formatPricingAmount(total, currency)} (taxes included)` });
      const dep = Number(res.deposit_required) || 0;
      if (dep > 0) rows.push({ label: "Deposit", value: `${formatPricingAmount(dep, currency)}${res.deposit_due_date ? `, due by ${formatDayLong(res.deposit_due_date as string)}` : ""}` });
    } else if (params.kind === "change") {
      subject = `Your booking at ${hotel} has changed (${code})`;
      title = "Your booking has changed";
      intro = `Hello ${name}, we have updated your booking at ${hotel}.`;
      badgeLabel = "Updated";
      tone = "amber";
      rows.push({ label: "New total", value: `${formatPricingAmount(total, currency)} (taxes included)` });
      for (const c of params.changes ?? []) textLines.push(c);
    } else {
      subject = `Your booking at ${hotel} is cancelled (${code})`;
      title = "Your booking is cancelled";
      intro = `Hello ${name}, your booking at ${hotel} has been cancelled.`;
      badgeLabel = "Cancelled";
      tone = "red";
      const fee = Number(res.cancellation_fee) || 0;
      const feeStatus = res.cancellation_fee_status as string;
      rows.push({
        label: "Cancellation fee",
        value:
          fee <= 0 || feeStatus === "waived" || feeStatus === "none"
            ? "No fee"
            : feeStatus === "kept_from_deposit"
              ? `${formatPricingAmount(fee, currency)}, taken from your deposit`
              : `${formatPricingAmount(fee, currency)}`,
      });
    }

    if (settings.extraNote) extra.push(settings.extraNote);
    if (params.kind !== "cancellation" && policyLines.length) extra.push(["Cancellation policy", ...policyLines].join("\n"));

    const text = [
      `Hello ${name},`,
      "",
      intro,
      "",
      ...(params.kind === "change" && textLines.length ? ["What changed:", ...textLines.map((l) => `- ${l}`), ""] : []),
      ...rows.map((r) => `${r.label}: ${r.value}`),
      "",
      ...extra.flatMap((e) => [e, ""]),
      `${hotel}`,
    ].join("\n");

    const changesHtml =
      params.kind === "change" && textLines.length
        ? `<p style="margin:0 0 12px;font-size:14px;color:#1e293b"><strong>What changed</strong></p><ul style="margin:0 0 20px 18px;padding:0;font-size:14px;color:#1e293b">${textLines
            .map((l) => `<li style="margin:0 0 6px">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</li>`)
            .join("")}</ul>`
        : "";
    const notesHtml = extra
      .map((e) => `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#475569;white-space:pre-line">${e.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
      .join("");

    await sendBrandedEmail({
      to,
      subject,
      text,
      layout: {
        preheader: `${hotel}: ${formatDayLong(arrival)} to ${formatDayLong(departure)}. Booking ${code}.`,
        badges: [badge(badgeLabel, tone)],
        title,
        intro,
        body: `${changesHtml}${detailsPanel(rows)}${notesHtml}`,
        footerNote: `You are receiving this because of your booking at ${hotel}. Quote ${code} if you contact us.`,
      },
    });
    await log("sent", to, subject);
    return { ok: true, status: "sent", to };
  } catch (e) {
    const message = e instanceof Error ? e.message : "The email could not be sent.";
    console.warn("[reservation-email]", message);
    await log("failed", null, null, message.slice(0, 300)).catch(() => undefined);
    return { ok: false, status: "failed", reason: "The email could not be sent. Check the mail settings and send it again." };
  }
}
