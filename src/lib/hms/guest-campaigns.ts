import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { signUnsubscribeToken } from "@/lib/hms/guest-consent";
import { loadSegmentPool, rulesForKey } from "@/lib/hms/guest-segments";
import { emailableMembers, type SegmentGuest } from "@/lib/hms/guest-segments-shared";

/*
 * Emailing an offer to a group of guests. The rules that keep it lawful are built in:
 * only guests who agreed to email offers are sent anything, erased guests never are, every email
 * carries a one-click unsubscribe, and each send is written down.
 */

export const MAX_RECIPIENTS = 500;

export type CampaignRecord = {
  id: string;
  segmentLabel: string;
  subject: string;
  recipients: number;
  sent: number;
  failed: number;
  isTest: boolean;
  createdAt: string;
};


async function hotelName(service: SupabaseClient, tenantId: string) {
  const { data } = await service.from("tenants").select("name,display_name").eq("id", tenantId).maybeSingle();
  return (data?.display_name as string) || (data?.name as string) || "Your hotel";
}

export async function countEmailable(service: SupabaseClient, tenantId: string, keys: string[], pool?: SegmentGuest[]) {
  const guests = pool ?? (await loadSegmentPool(service, tenantId));
  const out: Record<string, number> = {};
  for (const key of keys) {
    const found = await rulesForKey(service, tenantId, key);
    out[key] = found ? emailableMembers(guests, found.rules).length : 0;
  }
  return out;
}

export async function listCampaigns(service: SupabaseClient, tenantId: string, limit = 10): Promise<CampaignRecord[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("guest_campaigns")
    .select("id,segment_label,subject,recipients,sent,failed,is_test,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((c) => ({
    id: c.id as string,
    segmentLabel: c.segment_label as string,
    subject: c.subject as string,
    recipients: Number(c.recipients) || 0,
    sent: Number(c.sent) || 0,
    failed: Number(c.failed) || 0,
    isTest: Boolean(c.is_test),
    createdAt: c.created_at as string,
  }));
}

export async function sendCampaign(
  service: SupabaseClient,
  params: {
    tenantId: string;
    actorUserId: string;
    /** The sender's own address, used for test sends and as the reply-to. */
    actorEmail: string | null;
    origin: string;
    segmentKey: string;
    subject: string;
    message: string;
    testOnly: boolean;
  },
): Promise<{ ok: true; recipients: number; sent: number; failed: number } | { ok: false; error: string }> {
  const subject = params.subject.trim();
  const message = params.message.trim();
  if (!subject) return { ok: false, error: "Write a subject." };
  if (subject.length > 150) return { ok: false, error: "Keep the subject under 150 letters." };
  if (!message) return { ok: false, error: "Write the message." };
  if (message.length > 5000) return { ok: false, error: "Keep the message under 5,000 letters." };

  const found = await rulesForKey(service, params.tenantId, params.segmentKey);
  if (!found) return { ok: false, error: "That group wasn't found." };

  const pool = await loadSegmentPool(service, params.tenantId);
  const hotel = await hotelName(service, params.tenantId);

  type Target = { id: string; email: string; firstName: string };
  let targets: Target[];
  if (params.testOnly) {
    if (!params.actorEmail) return { ok: false, error: "Your account has no email address to send a test to." };
    targets = [{ id: "test", email: params.actorEmail, firstName: "there" }];
  } else {
    const members = emailableMembers(pool, found.rules);
    if (members.length === 0) return { ok: false, error: "Nobody in this group has agreed to email offers yet." };
    if (members.length > MAX_RECIPIENTS) return { ok: false, error: `That is ${members.length} people. Send to at most ${MAX_RECIPIENTS} at a time: narrow the group first.` };
    targets = members.map((g) => ({ id: g.id, email: g.email, firstName: g.name.replace(/^(mr|mrs|ms|miss|dr|chief|prof)\.?\s+/i, "").split(/\s+/)[0] || "there" }));
  }

  let sent = 0;
  let failed = 0;
  const sendOne = async (t: Target) => {
    const unsubscribeUrl = t.id === "test" ? `${params.origin}/unsubscribe/test` : `${params.origin}/unsubscribe/${signUnsubscribeToken(params.tenantId, t.id)}`;
    const text = `${message.replace(/\{first_name\}/gi, t.firstName)}\n\nYou are getting this because you agreed to hear from ${hotel}. Stop these emails any time: ${unsubscribeUrl}`;
    try {
      await sendBrandedEmail({
        to: t.email,
        subject: params.testOnly ? `[Test] ${subject}` : subject,
        text,
        replyTo: params.actorEmail,
        headers:
          t.id === "test"
            ? undefined
            : {
                "List-Unsubscribe": `<${params.origin}/api/hotel/unsubscribe?token=${signUnsubscribeToken(params.tenantId, t.id)}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
        layout: {
          preheader: message.replace(/\s+/g, " ").slice(0, 110),
          title: subject,
          intro: message.replace(/\{first_name\}/gi, t.firstName),
          buttons: [],
          footerNote: `You are getting this because you agreed to hear from ${hotel}. To stop these emails, use this link: ${unsubscribeUrl}`,
        },
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      console.warn("[campaign] send failed", e instanceof Error ? e.message : e);
    }
  };

  // A few at a time, so a long list doesn't hammer the mail server.
  for (let i = 0; i < targets.length; i += 5) await Promise.all(targets.slice(i, i + 5).map(sendOne));

  await service.schema("hotel").from("guest_campaigns").insert({
    tenant_id: params.tenantId,
    segment_key: params.segmentKey,
    segment_label: found.label,
    subject,
    body: message,
    recipients: targets.length,
    sent,
    failed,
    is_test: params.testOnly,
    sent_by: params.actorUserId,
  });
  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: params.testOnly ? "guest_offer_test_sent" : "guest_offer_sent",
    entityType: "guest_campaign",
    after: { segment: found.label, recipients: targets.length, sent, failed },
  });
  return { ok: true, recipients: targets.length, sent, failed };
}
