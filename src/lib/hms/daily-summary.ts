import type { SupabaseClient } from "@supabase/supabase-js";
import { badge, detailsPanel, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { ALERT_GROUPS, alertGroupForType } from "@/lib/hms/notification-catalogue";
import { getHotelIdentity, getHotelTimeZone } from "@/lib/hms/alert-delivery";

/*
 * The manager's morning email: where the hotel stands today and what happened in the last day.
 * Sent by the hourly cron to each owner or admin who switched it on under My alerts, at the hour
 * they chose (hotel time), once a day. Front desk times are wall-clock stored as UTC, so "today"
 * is the hotel's local date read as a UTC day.
 */

export type SummaryNumbers = {
  date: string;
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  rooms: number;
  occupancyPercent: number;
  overdueDepartures: number;
  alertsByGroup: { label: string; count: number }[];
  criticalAlerts: number;
  unreadAlerts: number;
};

/** The hotel's local calendar date, as YYYY-MM-DD. */
export function localDate(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function localHour(now: Date, timeZone: string) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Whether this person's summary is due: the hour has come and today's hasn't gone out. */
export function summaryDue(opts: { summaryHour: number; lastSent: string | null; now: Date; timeZone: string }) {
  return localHour(opts.now, opts.timeZone) >= opts.summaryHour && opts.lastSent !== localDate(opts.now, opts.timeZone);
}

export async function buildSummary(service: SupabaseClient, tenantId: string, userId: string, now: Date, timeZone: string): Promise<SummaryNumbers> {
  const date = localDate(now, timeZone);
  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString();
  const since = new Date(now.getTime() - 86400000).toISOString();
  const res = service.schema("hotel").from("reservations");
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [arrivalsToday, departuresToday, inHouse, rooms, overdueDepartures, alerts, reads] = await Promise.all([
    count(res.select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["confirmed", "checked_in"]).gte("arrival_at", dayStart).lt("arrival_at", dayEnd)),
    count(res.select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["checked_in", "checked_out"]).gte("departure_at", dayStart).lt("departure_at", dayEnd)),
    count(res.select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "checked_in")),
    count(service.schema("hotel").from("room_units").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    count(res.select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "checked_in").lt("departure_at", now.toISOString())),
    service.schema("hotel").from("notifications").select("id,type,severity").eq("tenant_id", tenantId).gte("created_at", since).limit(500),
    service.schema("hotel").from("notification_reads").select("notification_id").eq("tenant_id", tenantId).eq("user_id", userId),
  ]);

  const readIds = new Set((reads.data ?? []).map((r) => r.notification_id as string));
  const list = alerts.data ?? [];
  const byGroup = new Map<string, number>();
  for (const a of list) byGroup.set(alertGroupForType(a.type as string), (byGroup.get(alertGroupForType(a.type as string)) ?? 0) + 1);

  return {
    date,
    arrivalsToday,
    departuresToday,
    inHouse,
    rooms,
    occupancyPercent: rooms > 0 ? Math.round((inHouse / rooms) * 100) : 0,
    overdueDepartures,
    alertsByGroup: ALERT_GROUPS.map((g) => ({ label: g.label, count: byGroup.get(g.key) ?? 0 })).filter((g) => g.count > 0),
    criticalAlerts: list.filter((a) => a.severity === "critical").length,
    unreadAlerts: list.filter((a) => !readIds.has(a.id as string)).length,
  };
}

export async function sendDailySummary(service: SupabaseClient, tenantId: string, userId: string, email: string, now: Date) {
  const [timeZone, identity] = await Promise.all([getHotelTimeZone(service, tenantId), getHotelIdentity(service, tenantId)]);
  const n = await buildSummary(service, tenantId, userId, now, timeZone);
  const attention = n.overdueDepartures > 0 || n.criticalAlerts > 0;
  const headline = `${n.arrivalsToday} arriving, ${n.departuresToday} leaving, ${n.inHouse} in house (${n.occupancyPercent}%).`;
  const alertLines = n.alertsByGroup.length ? n.alertsByGroup.map((g) => `${g.label}: ${g.count}`).join(", ") : "No alerts";
  const link = `${EMAIL_SITE_URL}/hms/${identity.slug}/dashboard`;
  await sendBrandedEmail({
    to: email,
    subject: `${identity.hotelName} daily summary · ${n.date}`,
    text: `${identity.hotelName} on ${n.date}\n${headline}\nPast departure time: ${n.overdueDepartures}\nAlerts in the last 24 hours: ${alertLines}\nUnread by you: ${n.unreadAlerts}\n\nOpen: ${link}`,
    layout: {
      preheader: headline,
      badges: [badge(attention ? "Needs attention" : "All calm", attention ? "amber" : "green")],
      title: `${identity.hotelName} today`,
      intro: headline,
      body: detailsPanel([
        { label: "Arriving today", value: String(n.arrivalsToday) },
        { label: "Leaving today", value: String(n.departuresToday) },
        { label: "In house", value: `${n.inHouse} of ${n.rooms} rooms (${n.occupancyPercent}%)` },
        { label: "Past departure time", value: String(n.overdueDepartures) },
        { label: "Alerts in the last 24 hours", value: alertLines },
        { label: "Urgent alerts", value: String(n.criticalAlerts) },
        { label: "Unread by you", value: String(n.unreadAlerts) },
      ]),
      buttons: [{ label: "Open the dashboard", href: link }],
      footerNote: "You get this because you switched on the daily summary under Notifications, My alerts.",
    },
  });
  return n;
}
