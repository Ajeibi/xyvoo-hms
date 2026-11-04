import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAlert } from "@/lib/hms/alerts";
import { isDelayedRow } from "@/lib/hms/guest-services";
import { notifyOverdueCheckout, notifySlaBreach } from "@/lib/hms/notification-rules";

/*
 * Alerts that depend on the clock rather than on someone clicking: stays past their departure,
 * guest requests past their SLA, and critical alerts nobody has read. Run by the hourly cron
 * (src/app/api/cron/hms-alerts). Each alert carries a dedupe window so an hourly run doesn't
 * repeat itself.
 */

/** How long a critical alert may sit unread before the owners and admins are told. */
export const ESCALATE_AFTER_MINUTES = 15;

type GuestEmbed = { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
type StayRow = {
  id: string;
  departure_at: string;
  room_units: { room_code: string } | { room_code: string }[] | null;
  reservation_guests: { is_primary: boolean; guests: GuestEmbed }[] | null;
};

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

function primaryGuestName(rows: StayRow["reservation_guests"]) {
  const link = rows?.find((r) => r.is_primary) ?? rows?.[0];
  const g = one(link?.guests ?? null);
  return `${g?.first_name ?? ""} ${g?.last_name ?? ""}`.trim() || "Guest";
}

/** In-house stays past their departure time. Returns how many it checked (repeats are skipped by the dedupe window). */
export async function sweepOverdueCheckouts(service: SupabaseClient, tenantId: string, now = new Date()) {
  const { data } = await service
    .schema("hotel")
    .from("reservations")
    .select("id,departure_at,room_units(room_code),reservation_guests(is_primary,guests(first_name,last_name))")
    .eq("tenant_id", tenantId)
    .eq("status", "checked_in")
    .lt("departure_at", now.toISOString())
    .limit(100);
  let raised = 0;
  for (const r of (data ?? []) as unknown as StayRow[]) {
    await notifyOverdueCheckout({
      tenantId,
      entityId: r.id,
      guestName: primaryGuestName(r.reservation_guests),
      roomCode: one(r.room_units)?.room_code ?? "—",
      dedupeHours: 12,
    });
    raised += 1;
  }
  return raised;
}

/** Guest requests past their SLA that are still open. */
export async function sweepSlaBreaches(service: SupabaseClient, tenantId: string, now = new Date()) {
  const { data } = await service
    .schema("hotel")
    .from("guest_requests")
    .select("id,request_type,department,status,expected_completed_at,room_units(room_code)")
    .eq("tenant_id", tenantId)
    .is("completed_at", null)
    .lt("expected_completed_at", now.toISOString())
    .limit(100);
  let raised = 0;
  for (const r of data ?? []) {
    if (!isDelayedRow(r.expected_completed_at as string | null, r.status as string)) continue;
    await notifySlaBreach({
      tenantId,
      entityId: r.id as string,
      department: (r.department as string | null) ?? null,
      requestType: r.request_type as string,
      roomCode: one(r.room_units as { room_code: string } | { room_code: string }[] | null)?.room_code ?? null,
      minutesOverdue: Math.round((now.getTime() - new Date(r.expected_completed_at as string).getTime()) / 60000),
      dedupeHours: 2,
    });
    raised += 1;
  }
  return raised;
}

/**
 * Critical alerts older than ESCALATE_AFTER_MINUTES that nobody has read: one follow-up alert to
 * the owners and admins' side of the house (department "management", which department-scoped
 * staff don't see), then the original is marked escalated so it happens once.
 */
export async function sweepEscalations(service: SupabaseClient, tenantId: string, now = new Date()) {
  const before = new Date(now.getTime() - ESCALATE_AFTER_MINUTES * 60000).toISOString();
  const since = new Date(now.getTime() - 24 * 3600000).toISOString();
  const { data, error } = await service
    .schema("hotel")
    .from("notifications")
    .select("id,title,body")
    .eq("tenant_id", tenantId)
    .eq("severity", "critical")
    .neq("type", "alert_escalated")
    .is("escalated_at", null)
    .lt("created_at", before)
    .gt("created_at", since)
    .limit(50);
  // Until the migration adds escalated_at there is nothing to track, so nothing escalates.
  if (error || !data?.length) return 0;

  const ids = data.map((n) => n.id as string);
  const { data: reads } = await service.schema("hotel").from("notification_reads").select("notification_id").in("notification_id", ids);
  const read = new Set((reads ?? []).map((r) => r.notification_id as string));

  let escalated = 0;
  for (const n of data) {
    const id = n.id as string;
    if (read.has(id)) {
      // Someone has it; nothing to chase.
      await service.schema("hotel").from("notifications").update({ escalated_at: now.toISOString() }).eq("id", id);
      continue;
    }
    await sendAlert({
      tenantId,
      type: "alert_escalated",
      title: `Nobody has opened: ${n.title}`,
      body: `${n.body} Urgent for ${ESCALATE_AFTER_MINUTES} minutes with no one reading it.`,
      severity: "critical",
      entityType: "notification",
      entityId: id,
      department: "management",
    });
    await service.schema("hotel").from("notifications").update({ escalated_at: now.toISOString() }).eq("id", id);
    escalated += 1;
  }
  return escalated;
}
