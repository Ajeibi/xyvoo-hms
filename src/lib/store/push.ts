import webpush, { WebPushError } from "web-push";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Store app push notifications (Web Push with VAPID keys). Customers subscribe
 * from a store's site or installed app; owners send from the dashboard. Keys
 * come only from environment variables:
 *
 *   VAPID_PUBLIC_KEY    shared with browsers when they subscribe
 *   VAPID_PRIVATE_KEY   signs every push; server only, never logged or exposed
 *   VAPID_SUBJECT       contact for push services, e.g. mailto:support@getxyvoo.com
 */

export const PUSH_DAILY_LIMIT = 3;
export const PUSH_TITLE_MAX = 60;
export const PUSH_BODY_MAX = 160;

export type PushConfig = { publicKey: string; privateKey: string; subject: string };

export function getPushConfig(): PushConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:support@getxyvoo.com" };
}

/** Only the public key, for pages that let customers subscribe. */
export const getPushPublicKey = () => getPushConfig()?.publicKey ?? null;

const base64url = z.string().min(10).max(200).regex(/^[A-Za-z0-9_-]+=*$/, "Invalid key.");

/** A browser PushSubscription as sent from the store page (JSON form). */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((u) => u.startsWith("https://"), "Push endpoints must use https."),
  keys: z.object({ p256dh: base64url, auth: base64url }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** A path inside the store, e.g. "/" or "/products/mug". Never another site. */
export const storePathSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?![/\\])[^\s]*$/, "Choose a page in your shop.");

export const pushMessageSchema = z.object({
  title: z.string().trim().min(1, "Add a title.").max(PUSH_TITLE_MAX, `Keep the title to ${PUSH_TITLE_MAX} characters.`),
  body: z.string().trim().min(1, "Add a message.").max(PUSH_BODY_MAX, `Keep the message to ${PUSH_BODY_MAX} characters.`),
  path: storePathSchema.default("/"),
});
export type PushMessage = z.infer<typeof pushMessageSchema>;

const storeDb = () => createServerSupabaseClient().schema("store");

export async function savePushSubscription(tenantId: string, sub: PushSubscriptionInput, userAgent: string | null) {
  const { error } = await storeDb()
    .from("push_subscriptions")
    .upsert(
      {
        tenant_id: tenantId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent?.slice(0, 300) ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,endpoint" },
    );
  if (error) throw new Error(error.message);
}

export async function removePushSubscription(tenantId: string, endpoint: string) {
  const { error } = await storeDb().from("push_subscriptions").delete().eq("tenant_id", tenantId).eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}

export async function countPushSubscribers(tenantId: string) {
  const { count, error } = await storeDb().from("push_subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type SentNotification = { id: string; title: string; body: string; path: string; recipients: number; delivered: number; failed: number; createdAt: string };

export async function listSentNotifications(tenantId: string, limit = 20): Promise<SentNotification[]> {
  const { data, error } = await storeDb()
    .from("push_notifications")
    .select("id, title, body, path, recipients, delivered, failed, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map((n) => ({ id: n.id, title: n.title, body: n.body, path: n.path, recipients: n.recipients, delivered: n.delivered, failed: n.failed, createdAt: n.created_at }));
}

/** How many more notifications the store may send in the rolling 24 hours. */
export function notificationsLeftToday(sent: SentNotification[], now = Date.now()) {
  const since = now - 86_400_000;
  return Math.max(0, PUSH_DAILY_LIMIT - sent.filter((n) => new Date(n.createdAt).getTime() > since).length);
}

/**
 * What the service worker receives. Paths are relative to the store's app
 * scope, so the same payload works on <store>.getxyvoo.com and /shop/<store>.
 */
export function buildPushPayload(message: PushMessage, notificationId: string) {
  return JSON.stringify({
    title: message.title,
    body: message.body,
    path: message.path,
    icon: "app-icon/192",
    badge: "app-icon/badge",
    tag: `store-notification-${notificationId}`,
  });
}

type SendResult = { recipients: number; delivered: number; failed: number; removed: number };

/** Sends to every subscriber of a store, removing subscriptions the push service says are gone. */
export async function sendStoreNotification(tenantId: string, message: PushMessage, sentBy: string): Promise<SendResult & { id: string }> {
  const config = getPushConfig();
  if (!config) throw new Error("Push notifications aren't set up on the server.");

  const db = storeDb();
  const { data: record, error: insertError } = await db
    .from("push_notifications")
    .insert({ tenant_id: tenantId, title: message.title, body: message.body, path: message.path, sent_by: sentBy })
    .select("id")
    .single();
  if (insertError || !record) throw new Error(insertError?.message || "Couldn't record the notification.");

  const { data: subs, error } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  const payload = buildPushPayload(message, record.id);
  const options = { vapidDetails: config, TTL: 24 * 60 * 60, urgency: "normal" as const };
  const result: SendResult = { recipients: subs?.length ?? 0, delivered: 0, failed: 0, removed: 0 };
  const gone: string[] = [];

  const list = subs || [];
  for (let i = 0; i < list.length; i += 50) {
    await Promise.all(
      list.slice(i, i + 50).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options);
          result.delivered += 1;
        } catch (e) {
          result.failed += 1;
          // 404/410: the customer unsubscribed or the browser dropped it.
          if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.id);
        }
      }),
    );
  }

  if (gone.length) {
    await db.from("push_subscriptions").delete().in("id", gone);
    result.removed = gone.length;
  }
  await db.from("push_notifications").update({ recipients: result.recipients, delivered: result.delivered, failed: result.failed }).eq("id", record.id);
  return { id: record.id, ...result };
}
