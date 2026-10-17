import { after, NextResponse } from "next/server";
import { sendContactRequestEmail, sendWaitlistConfirmationEmail } from "@/lib/mail/mailtrap";
import { waitlistConfirmationEmail, waitlistRequestSchema, waitlistTeamEmail } from "@/lib/marketing/waitlist";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST /api/public/waitlist
 *
 * Joins the alpha-test waitlist. Each address gets one confirmation email, the
 * first time it joins; joining again gets the same answer but sends nothing, so
 * the form can't be used to fill someone's inbox. Not behind the auth lock.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`waitlist:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many tries. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the request as JSON." }, { status: 400 });
  }

  const parsed = waitlistRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check your email address and try again." }, { status: 422 });
  }
  const { email, product, website } = parsed.data;

  // Honeypot filled in: pretend success so bots learn nothing, but save and send nothing.
  if (website) return NextResponse.json({ ok: true });

  const db = createServerSupabaseClient();
  const { data: inserted, error } = await db
    .from("waitlist_signups")
    .upsert({ email, product: product ?? null }, { onConflict: "email", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[waitlist] save failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "We couldn't add you to the waitlist just now. Please try again." }, { status: 500 });
  }

  // Already on the list: same answer, nothing sent.
  const signupId = inserted?.[0]?.id as string | undefined;
  if (!signupId) return NextResponse.json({ ok: true });

  // Emails go after the reply, so a slow or failing mail server never keeps the visitor waiting.
  after(async () => {
    try {
      await sendWaitlistConfirmationEmail({ to: email, ...waitlistConfirmationEmail(product) });
      await db.from("waitlist_signups").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", signupId);
    } catch (error) {
      // They're on the list either way; the team can see who has no confirmation_sent_at.
      const e = error as { code?: string; responseCode?: number; response?: string; message?: string };
      console.error("[waitlist] confirmation email failed", { code: e.code, responseCode: e.responseCode, response: e.response ?? e.message });
    }
    try {
      const { to, subject, text, html } = waitlistTeamEmail(email, product);
      await sendContactRequestEmail({ to, replyTo: email, subject, text, html });
    } catch (error) {
      console.error("[waitlist] team email failed", { message: (error as Error).message });
    }
  });

  return NextResponse.json({ ok: true });
}
