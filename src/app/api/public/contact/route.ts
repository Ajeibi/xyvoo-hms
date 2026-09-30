import { NextResponse } from "next/server";
import { contactRequestSchema, teamEmail } from "@/lib/marketing/contact-request";
import { sendContactRequestEmail } from "@/lib/mail/mailtrap";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/public/contact
 *
 * Marketing-site contact form. Sales enquiries go to hello@ and support requests to
 * support@, with reply-to set to the sender. Nothing is sent back to the sender, so the
 * form can't be used to push content to arbitrary inboxes.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`contact:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many messages. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the message as JSON." }, { status: 400 });
  }

  const parsed = contactRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
        fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }
  const req = parsed.data;

  // Honeypot filled in: pretend success so bots learn nothing, but send nothing.
  if (req.website) return NextResponse.json({ ok: true });

  try {
    const { to, cc, subject, text, html, reference } = teamEmail(req);
    await sendContactRequestEmail({ to, cc, replyTo: req.email, subject, text, html });
    return NextResponse.json({ ok: true, reference });
  } catch {
    return NextResponse.json(
      { error: "We couldn't send your message. Please try again or email us directly." },
      { status: 500 },
    );
  }
}
