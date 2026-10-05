import { randomInt } from "node:crypto";
import { z } from "zod";
import { badge, type BadgeTone, detailsPanel, quoteBlock, renderEmail } from "@/lib/mail/layout";

/**
 * Messages from the marketing site's contact form. "Talk to Sales" goes to the hello@
 * inbox and "Get Support" to the support@ inbox, with reply-to set to the sender so the
 * team can answer straight from Zoho.
 */

export const CONTACT_INBOXES = {
  sales: "hello@getxyvoo.com",
  support: "support@getxyvoo.com",
} as const;

/** Copied (CC) on every contact-form email, whichever inbox it goes to. */
export const CONTACT_CC = ["oche.francis@getxyvoo.com"];

const shortText = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => shortText(max).optional().or(z.literal(""));

export const contactRequestSchema = z
  .object({
    type: z.enum(["sales", "support"]),
    name: shortText(120).min(1, "Please enter your name."),
    email: z.string().trim().email("Please enter a valid email address.").max(160),
    company: optionalText(160),
    businessType: optionalText(80),
    urgency: optionalText(80),
    message: shortText(5000).min(1, "Please enter a message."),
    /** Honeypot: real visitors never see or fill this field. The route ignores requests that fill it. */
    website: z.string().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "support" && !value.company) {
      ctx.addIssue({ code: "custom", path: ["company"], message: "Please enter your hotel or store name." });
    }
  });

export type ContactRequest = z.infer<typeof contactRequestSchema>;

/** Short reference for threading and follow-up, e.g. CNT-7K4Q2M. Avoids 0/O and 1/I. */
export function contactReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "";
  for (let i = 0; i < 6; i++) ref += alphabet[randomInt(alphabet.length)];
  return `CNT-${ref}`;
}

function urgencyTone(urgency: string): BadgeTone {
  const level = urgency.split(/\s/)[0]?.toLowerCase();
  if (level === "urgent") return "red";
  if (level === "high") return "orange";
  if (level === "medium") return "amber";
  return "green";
}

const formatReceived = (date: Date) =>
  `${date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })} WAT`;

/** Email to the XYVOO team inbox for this request type. */
export function teamEmail(req: ContactRequest, reference = contactReference(), receivedAt = new Date()) {
  const to = CONTACT_INBOXES[req.type];
  const isSales = req.type === "sales";
  const label = isSales ? "Sales enquiry" : "Support request";
  const firstName = req.name.split(/\s+/)[0] || req.name;

  const rows = [
    { label: "Name", value: req.name },
    { label: "Email", value: req.email, href: `mailto:${req.email}` },
    { label: isSales ? "Hotel / company" : "Hotel / storefront", value: req.company || "Not given" },
    isSales
      ? { label: "Running", value: req.businessType || "Not given" }
      : { label: "Urgency", value: req.urgency || "Not given" },
  ];

  const subject = `${label} from ${req.name}${req.company ? ` (${req.company})` : ""} [${reference}]`.replace(/\s+/g, " ");
  const received = formatReceived(receivedAt);
  const replySubject = `Re: ${label} [${reference}]`;
  const replyHref = `mailto:${req.email}?subject=${encodeURIComponent(replySubject)}`;

  const badges = [badge(isSales ? "Sales" : "Support", "blue")];
  if (!isSales && req.urgency) badges.push(badge(req.urgency.split(/\s/)[0], urgencyTone(req.urgency)));
  if (isSales && req.businessType) badges.push(badge(req.businessType, "green"));

  const text = [
    `${label} from the website contact form (${reference}).`,
    "",
    ...rows.map(({ label: k, value: v }) => `${k}: ${v}`),
    "",
    "Message:",
    req.message,
    "",
    `Received ${received}. Replying to this email goes to ${req.email}.`,
  ].join("\n");

  const html = renderEmail({
    preheader: `${req.name}${req.company ? ` from ${req.company}` : ""}: ${req.message.slice(0, 90)}`,
    badges,
    title: `New ${label.toLowerCase()} from ${req.name}`,
    intro: isSales
      ? `${firstName} filled in the “Talk to Sales” form on the website. Their details and message are below.`
      : `${firstName} asked for help through the “Get Support” form on the website. Their details and message are below.`,
    body: detailsPanel(rows) + quoteBlock("Message", req.message),
    buttons: [{ label: `Reply to ${firstName}`, href: replyHref }],
    meta: `Reference ${reference} · Received ${received} · Replying to this email goes straight to ${req.email}.`,
    footerNote: "Sent to the XYVOO team from the contact form at getxyvoo.com.",
  });

  return { to, cc: CONTACT_CC, subject, text, html, reference };
}
