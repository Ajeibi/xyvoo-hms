import type { SupabaseClient } from "@supabase/supabase-js";
import { departmentScopeForRole } from "@/lib/hms/guest-services-rbac";
import { alertGroupForType, roleSeesGroup, type AlertGroup } from "@/lib/hms/notification-catalogue";
import { DEFAULT_FB_TIME_ZONE, isValidTimeZone } from "@/lib/hms/fb-price-rules";
import { applyChoices, getHotelDefaults, type AlertChannel, type AlertChoices } from "@/lib/hms/notification-preferences";
import { getUserSettingsFor, shouldHoldAlert, type NotificationUserSettings } from "@/lib/hms/notification-settings";
import { sendAlertEmail, sendAlertPush, sendAlertWhatsApp, type AlertMessage, type ChannelOutcome } from "@/lib/hms/alert-channels";
import type { AlertSeverity } from "@/lib/hms/alerts";

/*
 * Takes a saved alert to the people who chose to get it outside the app: email, push and
 * WhatsApp. Each person's choices come from the hotel's defaults and their own "My alerts".
 * During their quiet hours an alert is recorded as "held" and sent by the hourly sweep once
 * the quiet hours end. Every attempt is written to hotel.notification_deliveries.
 */

const OUTSIDE_CHANNELS = ["email", "whatsapp", "push"] as const satisfies readonly AlertChannel[];
type OutsideChannel = (typeof OUTSIDE_CHANNELS)[number];

export type SavedAlert = {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  body: string;
  severity: AlertSeverity;
  department: string | null;
};

type Recipient = { userId: string; email: string | null; departmentScope: string | null; departmentRole: string | null; settings: NotificationUserSettings };

const missingTable = (error: { code?: string } | null) => Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));

export async function getHotelTimeZone(service: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await service.schema("hotel").from("tenant_fb_settings").select("time_zone").eq("tenant_id", tenantId).maybeSingle();
  return typeof data?.time_zone === "string" && isValidTimeZone(data.time_zone) ? data.time_zone : DEFAULT_FB_TIME_ZONE;
}

export async function getHotelIdentity(service: SupabaseClient, tenantId: string) {
  const { data } = await service.from("tenants").select("subdomain,name,display_name").eq("id", tenantId).maybeSingle();
  const slug = String(data?.subdomain || data?.name || "");
  return { slug, hotelName: (data?.display_name as string | null)?.trim() || slug };
}

/** Whether a person scoped to a department should see an alert aimed at `department`. */
export const visibleToScope = (alertDepartment: string | null, scope: string | null) => !alertDepartment || !scope || alertDepartment === scope;

/** Members' choices for one group, keyed by user id, with the hotel's defaults underneath. */
async function choicesByUser(service: SupabaseClient, tenantId: string, userIds: string[]) {
  const base = await getHotelDefaults(service, tenantId);
  const { data } = await service
    .schema("hotel")
    .from("notification_preferences")
    .select("user_id,category,in_app,email,whatsapp,push")
    .eq("tenant_id", tenantId)
    .in("user_id", userIds);
  const rows = new Map<string, NonNullable<typeof data>>();
  for (const r of data ?? []) rows.set(r.user_id as string, [...(rows.get(r.user_id as string) ?? []), r]);
  const out = new Map<string, AlertChoices>();
  for (const id of userIds) out.set(id, applyChoices(rows.get(id) as never, base));
  return out;
}

async function membersWithRole(service: SupabaseClient, tenantId: string): Promise<Map<string, string | null>> {
  const { data: members } = await service.schema("hotel").from("memberships").select("user_id,role").eq("tenant_id", tenantId);
  return new Map((members ?? []).map((m) => [m.user_id as string, (m.role as string | null) ?? null]));
}

async function memberIds(service: SupabaseClient, tenantId: string): Promise<string[]> {
  return [...(await membersWithRole(service, tenantId)).keys()];
}

/** The people behind these user ids: email address, department and their own settings. */
async function loadRecipients(service: SupabaseClient, tenantId: string, ids: string[]): Promise<Recipient[]> {
  const settings = await getUserSettingsFor(service, tenantId, ids);
  const people = await Promise.all(
    ids.map(async (userId) => {
      const { data } = await service.auth.admin.getUserById(userId);
      const dept = typeof data?.user?.user_metadata?.department_role === "string" ? (data.user.user_metadata.department_role as string) : null;
      return {
        userId,
        email: data?.user?.email ?? null,
        departmentScope: departmentScopeForRole(dept),
        departmentRole: dept,
        settings: settings.get(userId)!,
      } satisfies Recipient;
    }),
  );
  return people;
}

async function recordDelivery(
  service: SupabaseClient,
  d: { tenantId: string; notificationId: string; userId: string; channel: OutsideChannel; status: "sent" | "held" | "failed" | "skipped"; detail?: string },
) {
  const { error } = await service
    .schema("hotel")
    .from("notification_deliveries")
    .upsert(
      { tenant_id: d.tenantId, notification_id: d.notificationId, user_id: d.userId, channel: d.channel, status: d.status, detail: d.detail ?? null, created_at: new Date().toISOString() },
      { onConflict: "notification_id,user_id,channel" },
    );
  if (error && !missingTable(error)) console.warn("[alert-delivery] log failed", error.message);
}

async function sendOnChannel(
  service: SupabaseClient,
  tenantId: string,
  channel: OutsideChannel,
  person: Recipient,
  message: AlertMessage,
): Promise<ChannelOutcome> {
  if (channel === "email") {
    return person.email ? sendAlertEmail(person.email, message) : { status: "skipped", detail: "No email address on the account." };
  }
  if (channel === "whatsapp") {
    return person.settings.whatsappNumber
      ? sendAlertWhatsApp(person.settings.whatsappNumber, message)
      : { status: "skipped", detail: "No WhatsApp number added under My alerts." };
  }
  const { data: devices } = await service
    .schema("hotel")
    .from("notification_devices")
    .select("id,endpoint,p256dh,auth")
    .eq("tenant_id", tenantId)
    .eq("user_id", person.userId);
  return sendAlertPush(service, tenantId, (devices ?? []) as never, message);
}

/** Sends one saved alert to everyone who chose email, WhatsApp or push for its group. Never throws. */
export async function deliverAlert(service: SupabaseClient, alert: SavedAlert, now = new Date()) {
  try {
    const group: AlertGroup = alertGroupForType(alert.type);
    const roles = await membersWithRole(service, alert.tenantId);
    const ids = [...roles.keys()];
    if (ids.length === 0) return;
    // Most alerts reach nobody outside the app, so find that out before looking anyone up.
    const choices = await choicesByUser(service, alert.tenantId, ids);
    const interested = ids.filter((id) => OUTSIDE_CHANNELS.some((c) => choices.get(id)?.[group][c]));
    if (interested.length === 0) return;
    const people = (await loadRecipients(service, alert.tenantId, interested)).filter((p) => visibleToScope(alert.department, p.departmentScope))
      // A role only gets the alert groups that concern it: no kitchen alerts on the front desk's phone.
      .filter((p) => roleSeesGroup(roles.get(p.userId) ?? null, p.departmentRole, group));
    const wanted = people
      .map((p) => ({ person: p, channels: OUTSIDE_CHANNELS.filter((c) => choices.get(p.userId)?.[group][c]) }))
      .filter((w) => w.channels.length > 0);
    if (wanted.length === 0) return;

    const [timeZone, identity] = await Promise.all([getHotelTimeZone(service, alert.tenantId), getHotelIdentity(service, alert.tenantId)]);
    const message: AlertMessage = { type: alert.type, title: alert.title, body: alert.body, severity: alert.severity, ...identity };

    for (const { person, channels } of wanted) {
      const hold = shouldHoldAlert(person.settings, alert.severity, now, timeZone);
      for (const channel of channels) {
        const base = { tenantId: alert.tenantId, notificationId: alert.id, userId: person.userId, channel };
        if (hold) {
          await recordDelivery(service, { ...base, status: "held", detail: "Held for quiet hours." });
          continue;
        }
        const outcome = await sendOnChannel(service, alert.tenantId, channel, person, message);
        await recordDelivery(service, { ...base, ...outcome });
      }
    }
  } catch (e) {
    console.warn("[deliverAlert]", e);
  }
}

/** A test message to the person themselves, on one channel, so they can see it works. Not saved as an alert. */
export async function sendTestAlert(service: SupabaseClient, tenantId: string, userId: string, channel: OutsideChannel): Promise<ChannelOutcome> {
  const [person] = await loadRecipients(service, tenantId, [userId]);
  if (!person) return { status: "failed", detail: "You aren't a member of this hotel." };
  const identity = await getHotelIdentity(service, tenantId);
  const outcome = await sendOnChannel(service, tenantId, channel, person, {
    type: "room_status",
    title: "Test alert",
    body: "This is a test from XYVOO. If you can read it, this channel works.",
    severity: "info",
    ...identity,
  });
  return outcome;
}

/** Sends alerts held for quiet hours whose recipient is now out of them. Returns how many went. */
export async function releaseHeldDeliveries(service: SupabaseClient, now = new Date()) {
  const { data: held, error } = await service
    .schema("hotel")
    .from("notification_deliveries")
    .select("tenant_id,notification_id,user_id,channel")
    .eq("status", "held")
    .limit(500);
  if (error || !held?.length) return 0;

  let released = 0;
  const members = new Map<string, Recipient[]>();
  const zones = new Map<string, string>();
  for (const h of held) {
    const tenantId = h.tenant_id as string;
    if (!members.has(tenantId)) {
      members.set(tenantId, await loadRecipients(service, tenantId, await memberIds(service, tenantId)));
      zones.set(tenantId, await getHotelTimeZone(service, tenantId));
    }
    const person = members.get(tenantId)!.find((p) => p.userId === h.user_id);
    const { data: n } = await service
      .schema("hotel")
      .from("notifications")
      .select("id,type,title,body,severity")
      .eq("id", h.notification_id)
      .maybeSingle();
    const base = { tenantId, notificationId: h.notification_id as string, userId: h.user_id as string, channel: h.channel as OutsideChannel };
    if (!person || !n) {
      await recordDelivery(service, { ...base, status: "skipped", detail: "The person or the alert no longer exists." });
      continue;
    }
    const severity = n.severity as AlertSeverity;
    if (shouldHoldAlert(person.settings, severity, now, zones.get(tenantId)!)) continue;
    const identity = await getHotelIdentity(service, tenantId);
    const outcome = await sendOnChannel(service, tenantId, base.channel, person, {
      type: n.type as string,
      title: n.title as string,
      body: n.body as string,
      severity,
      ...identity,
    });
    await recordDelivery(service, { ...base, ...outcome });
    if (outcome.status === "sent") released += 1;
  }
  return released;
}
