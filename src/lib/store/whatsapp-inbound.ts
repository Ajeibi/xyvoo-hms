import { createHmac, timingSafeEqual } from "node:crypto";
import { rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { storefrontUrl } from "./subdomain";
import { whatsappLink } from "./whatsapp";
import { sendTextMessage, whatsappMode } from "./whatsapp-sender";

/*
 * What comes back to XYVOO's WhatsApp number (see /api/webhooks/whatsapp):
 * delivery receipts for the order messages, STOP and START replies, and
 * anything else a shopper writes, which gets one short answer pointing them
 * to the shop's own WhatsApp, since nobody reads XYVOO's number.
 */

const store = () => createServerSupabaseClient().schema("store");

/** Meta signs each webhook with the app secret (X-Hub-Signature-256). */
export function validWhatsAppSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type ReplyKind = "stop" | "start" | "other";

/** STOP and START, however they're typed; anything else is a question for the shop. */
export function replyKind(text: string): ReplyKind {
  const word = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (["stop", "unsubscribe", "stop all", "opt out", "optout"].includes(word)) return "stop";
  if (["start", "subscribe", "opt in", "unstop"].includes(word)) return "start";
  return "other";
}

/** Statuses only move forward (sent, then delivered, then read); a failure always shows. */
const LATER: Record<string, string[]> = {
  sent: ["pending"],
  delivered: ["pending", "sent"],
  read: ["pending", "sent", "delivered"],
  failed: ["pending", "sent", "delivered"],
};

export async function recordDeliveryStatus(providerId: string, status: string, error: string | null) {
  const from = LATER[status];
  if (!from) return;
  await store()
    .from("whatsapp_messages")
    .update({ status, ...(error ? { error: error.slice(0, 500) } : {}), updated_at: new Date().toISOString() })
    .eq("provider_message_id", providerId)
    .in("status", from);
}

const STOPPED = "You won't get any more order updates on WhatsApp from shops on XYVOO. Reply START if you'd like them again.";
const STARTED = "Order updates are back on. We'll message you here when your orders move on.";
const NOT_READ = "This number only sends order updates from shops on XYVOO, so messages here aren't read.";

/** Where to send a shopper who wrote to XYVOO's number: the shop whose message they're answering. */
async function shopToContact(phone: string) {
  const { data: last } = await store().from("whatsapp_messages").select("tenant_id").eq("to_phone", phone).eq("audience", "customer").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!last) return null;
  const db = createServerSupabaseClient();
  const [{ data: tenant }, { data: profile }] = await Promise.all([
    db.from("tenants").select("subdomain, name, display_name").eq("id", last.tenant_id).maybeSingle(),
    db.schema("store").from("business_profile").select("whatsapp, country_code").eq("tenant_id", last.tenant_id).maybeSingle(),
  ]);
  if (!tenant) return null;
  const slug = String(tenant.subdomain || tenant.name);
  const name = (tenant.display_name as string | null)?.trim() || slug;
  const chat = whatsappLink((profile?.whatsapp as string | null) ?? null, `Hello ${name}, I have a question about my order.`, (profile?.country_code as string | null) || "NG");
  return { name, link: chat ?? storefrontUrl(slug), onWhatsApp: Boolean(chat) };
}

/** A message a shopper sent to XYVOO's number. Never throws. */
export async function handleIncomingMessage(phone: string, text: string) {
  try {
    if (!/^[1-9][0-9]{7,14}$/.test(phone)) return;
    const kind = replyKind(text);
    let reply: string;
    if (kind === "stop") {
      await store().from("whatsapp_opt_outs").upsert({ phone }, { onConflict: "phone", ignoreDuplicates: true });
      reply = STOPPED;
    } else if (kind === "start") {
      await store().from("whatsapp_opt_outs").delete().eq("phone", phone);
      reply = STARTED;
    } else {
      // One pointer an hour is plenty, however many messages they send.
      if (!(await rateLimitShared(`whatsapp-reply:${phone}`, 1, 60 * 60_000)).ok) return;
      const shop = await shopToContact(phone);
      reply = shop
        ? `${NOT_READ} To talk to ${shop.name}, ${shop.onWhatsApp ? "message them on WhatsApp" : "visit their shop"}: ${shop.link}`
        : NOT_READ;
    }
    // Replying is free and allowed: the shopper has just written to us.
    if (whatsappMode() === "cloud") await sendTextMessage(phone, reply);
  } catch (error) {
    console.error("[whatsapp] incoming message not handled", { error });
  }
}
