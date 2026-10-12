import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { isShopLive } from "@/lib/store/site/data";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { badge, detailsPanel, escapeHtml } from "@/lib/mail/layout";

const text = (max: number) => z.string().trim().max(max, "That's longer than we can take. Please shorten it.");

const MessageSchema = z.object({
  name: text(120).min(1, "Enter your name."),
  email: text(254).email("Enter an email address in the format name@example.com."),
  phone: text(30).optional().default(""),
  orderRef: text(40).optional().default(""),
  topic: text(80).optional().default(""),
  message: text(4000).min(5, "Enter your message."),
  /** A field people never see. Bots fill it in; we quietly drop those. */
  website: z.string().optional().default(""),
});

/** The shop's contact email, or its owner's sign-in email if it hasn't set one. */
async function shopInbox(tenantId: string) {
  const db = createServerSupabaseClient();
  const { data: profile } = await db.schema("store").from("business_profile").select("business_email").eq("tenant_id", tenantId).maybeSingle();
  if (profile?.business_email) return profile.business_email as string;
  const { data: owner } = await db.schema("store").from("memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "owner").limit(1).maybeSingle();
  if (!owner) return null;
  const { data } = await db.auth.admin.getUserById(owner.user_id as string);
  return data.user?.email ?? null;
}

/**
 * POST /api/shop/<store>/contact — a message from the shop's Contact page,
 * emailed to the shop with the shopper as the reply-to address.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant || !(await isShopLive(tenant.id))) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  const limit = await rateLimitShared(`contact:${tenant.id}:${clientIp(req)}`, 5, 10 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "You've sent a few messages already. Please wait a few minutes and try again." }, { status: 429 });

  const parsed = MessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "Please check the form.", field: issue?.path[0] }, { status: 400 });
  }
  const m = parsed.data;
  // Looks sent to the bot; nothing is delivered.
  if (m.website) return NextResponse.json({ ok: true });

  const to = await shopInbox(tenant.id);
  if (!to) return NextResponse.json({ error: "This shop can't receive messages just now. Please try WhatsApp or phone instead." }, { status: 503 });
  const storeName = tenant.displayName?.trim() || tenant.name || slug;
  const rows = [
    { label: "From", value: `${m.name} <${m.email}>` },
    ...(m.phone ? [{ label: "Phone", value: m.phone }] : []),
    ...(m.orderRef ? [{ label: "Order", value: m.orderRef }] : []),
    ...(m.topic ? [{ label: "About", value: m.topic }] : []),
  ];
  try {
    await sendBrandedEmail({
      to,
      replyTo: m.email,
      subject: `New message from ${m.name}${m.topic ? `: ${m.topic}` : ""}`,
      text: [`${m.name} sent a message from your ${storeName} website.`, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", m.message, "", "Reply to this email to answer them."].join("\n"),
      layout: {
        preheader: m.message.slice(0, 110),
        badges: [badge("Website message", "green")],
        title: `A message from ${m.name}`,
        intro: `Someone has written to you from your ${storeName} website. Reply to this email to answer them.`,
        body: `${detailsPanel(rows)}
          <p style="margin:20px 0 0;color:#1e293b;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(m.message)}</p>`,
        footerNote: `You're receiving this because a customer used the contact form on your ${storeName} website.`,
      },
    });
  } catch (error) {
    console.error("[contact form] not sent", { tenantId: tenant.id, error });
    return NextResponse.json({ error: "We couldn't send your message just now. Please try again in a moment." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
