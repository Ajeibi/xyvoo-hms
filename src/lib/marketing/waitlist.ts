import { z } from "zod";
import { badge, detailsPanel, renderEmail } from "@/lib/mail/layout";
import { CONTACT_INBOXES } from "@/lib/marketing/contact-request";
import { WAITLIST_PRODUCTS, waitlistProductName, type WaitlistProduct } from "@/lib/marketing/waitlist-products";

/**
 * The alpha-test waitlist. While sign-in and registration are locked, the
 * waitlist page collects an email address; the person gets one confirmation
 * email and the sales inbox gets a note of the sign-up. Server only: the
 * browser-safe product helpers are in waitlist-products.ts.
 */

export const waitlistRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter an email address in the format name@example.com.").max(160),
  product: z.enum(WAITLIST_PRODUCTS).nullish(),
  /** Honeypot: real visitors never see or fill this field. The route ignores requests that fill it. */
  website: z.string().max(200).optional(),
});

export type WaitlistRequest = z.infer<typeof waitlistRequestSchema>;

/** The email confirming someone's place on the waitlist. */
export function waitlistConfirmationEmail(product: WaitlistProduct | null | undefined) {
  const name = waitlistProductName(product);
  const subject = "You're on the XYVOO waitlist";
  const text = [
    "Thanks for your interest in XYVOO.",
    "",
    `We're testing ${name} with a small group of businesses before we open it to everyone, so sign-in and registration aren't open yet.`,
    "",
    "Your spot is saved. When it's your turn, we'll email you at this address with everything you need to get started. You don't need to do anything else.",
    "",
    "If you didn't ask to join, reply to this email and we'll take you off the list.",
    "",
    "The XYVOO team",
  ].join("\n");
  const html = renderEmail({
    preheader: "Your place is saved. We'll email you when it's your turn to get started.",
    badges: [badge("Waitlist")],
    title: "You're on the waitlist",
    intro: `Thanks for your interest in XYVOO. We're testing ${name} with a small group of businesses before we open it to everyone, so sign-in and registration aren't open yet.`,
    body: `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6">Your spot is saved. When it's your turn, we'll email you at this address with everything you need to get started. You don't need to do anything else.</p>
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">If you didn't ask to join, reply to this email and we'll take you off the list.</p>`,
    footerNote: "You're receiving this because this address was added to the XYVOO waitlist.",
  });
  return { subject, text, html };
}

/** The note to the sales inbox about a new sign-up. */
export function waitlistTeamEmail(email: string, product: WaitlistProduct | null | undefined, receivedAt = new Date()) {
  const name = product ? waitlistProductName(product) : "Didn't say";
  const when = `${receivedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })} WAT`;
  const subject = `Waitlist sign-up: ${email}`;
  const text = [`New waitlist sign-up.`, "", `Email: ${email}`, `Interested in: ${name}`, `Received: ${when}`].join("\n");
  const html = renderEmail({
    preheader: product ? `${email} joined the waitlist for ${name}.` : `${email} joined the waitlist.`,
    badges: [badge("Waitlist")],
    title: "New waitlist sign-up",
    body: detailsPanel([
      { label: "Email", value: email, href: `mailto:${email}` },
      { label: "Interested in", value: name },
      { label: "Received", value: when },
    ]),
    footerNote: "Sent to the XYVOO team from the waitlist page at getxyvoo.com. Reply to contact the person directly.",
  });
  return { to: CONTACT_INBOXES.sales, subject, text, html };
}
