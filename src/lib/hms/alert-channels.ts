import webpush, { WebPushError } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { badge, detailsPanel, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { getPushConfig } from "@/lib/store/push";
import { sendTextMessage, whatsappMode } from "@/lib/store/whatsapp-sender";
import type { AlertSeverity } from "@/lib/hms/alerts";
import { alertGroupForType, alertPath, ALERT_GROUPS } from "@/lib/hms/notification-catalogue";

/** What a channel needs to say about one alert. */
export type AlertMessage = {
  type: string;
  title: string;
  body: string;
  severity: AlertSeverity;
  hotelName: string;
  slug: string;
};

export type ChannelOutcome = { status: "sent" | "failed" | "skipped"; detail?: string };

const SEVERITY_TONE = { info: "blue", warning: "amber", critical: "red" } as const;

export const alertUrl = (m: Pick<AlertMessage, "slug" | "type">) => `${EMAIL_SITE_URL}${alertPath(m.slug, m.type)}`;

export async function sendAlertEmail(to: string, m: AlertMessage): Promise<ChannelOutcome> {
  try {
    const group = ALERT_GROUPS.find((g) => g.key === alertGroupForType(m.type))?.label ?? "Alert";
    await sendBrandedEmail({
      to,
      subject: `${m.severity === "critical" ? "Urgent: " : ""}${m.title} · ${m.hotelName}`,
      text: `${m.title}\n${m.body}\n\nOpen it: ${alertUrl(m)}`,
      layout: {
        preheader: m.body,
        badges: [badge(m.severity === "critical" ? "Urgent" : group, SEVERITY_TONE[m.severity])],
        title: m.title,
        intro: m.body,
        body: detailsPanel([{ label: "Hotel", value: m.hotelName }, { label: "Area", value: group }]),
        buttons: [{ label: "Open in XYVOO", href: alertUrl(m) }],
        footerNote: `You get this because ${m.hotelName} sends ${group.toLowerCase()} alerts to your email. Change this under Notifications, My alerts.`,
      },
    });
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", detail: e instanceof Error ? e.message.slice(0, 200) : "Email failed" };
  }
}

type Device = { id: string; endpoint: string; p256dh: string; auth: string };

/** Push to one person's phones and browsers; forgets devices the push service says are gone. */
export async function sendAlertPush(service: SupabaseClient, tenantId: string, devices: Device[], m: AlertMessage): Promise<ChannelOutcome> {
  const config = getPushConfig();
  if (!config) return { status: "skipped", detail: "Push isn't set up on the server." };
  if (devices.length === 0) return { status: "skipped", detail: "No device has push switched on." };
  const payload = JSON.stringify({
    title: m.title.slice(0, 80),
    body: m.body.slice(0, 200),
    url: alertPath(m.slug, m.type),
    tag: `hms-${m.type}`,
  });
  const options = { vapidDetails: config, TTL: 60 * 60, urgency: m.severity === "critical" ? ("high" as const) : ("normal" as const) };
  const gone: string[] = [];
  let delivered = 0;
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, options);
        delivered += 1;
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) gone.push(d.id);
      }
    }),
  );
  if (gone.length) await service.schema("hotel").from("notification_devices").delete().eq("tenant_id", tenantId).in("id", gone);
  return delivered > 0
    ? { status: "sent", detail: `${delivered} device${delivered === 1 ? "" : "s"}` }
    : { status: "failed", detail: "No device accepted it." };
}

/**
 * WhatsApp to a staff member's number. XYVOO's own number can only start a conversation with an
 * approved template, and none is approved for hotel alerts yet, so until WHATSAPP_MODE is "cloud"
 * the message is only recorded in the delivery log. In cloud mode a plain message is tried (it
 * reaches people who messaged the number in the last 24 hours) and a refusal is logged as failed.
 */
export async function sendAlertWhatsApp(number: string, m: AlertMessage): Promise<ChannelOutcome> {
  const text = `${m.severity === "critical" ? "URGENT: " : ""}${m.title}\n${m.body}\n${alertUrl(m)}`;
  if (whatsappMode() !== "cloud") return { status: "skipped", detail: "WhatsApp isn't live on this server; the message was not sent." };
  try {
    await sendTextMessage(number, text);
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", detail: e instanceof Error ? e.message.slice(0, 200) : "WhatsApp failed" };
  }
}
