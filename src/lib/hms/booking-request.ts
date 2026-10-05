import { randomInt } from "node:crypto";
import { z } from "zod";

/**
 * Booking *requests* from a hotel's public website. Nothing is charged and nothing is
 * reserved automatically: the hotel receives an email, checks availability and replies
 * to the guest. The guest gets an acknowledgement that clearly says the stay is not yet
 * confirmed.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");
const shortText = (max: number) => z.string().trim().max(max);

export const bookingRequestSchema = z
  .object({
    hotelSlug: shortText(80).min(1),
    room: shortText(120).min(1),
    ratePlan: shortText(80).optional().or(z.literal("")),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.coerce.number().int().min(1).max(12),
    children: z.coerce.number().int().min(0).max(12).default(0),
    rooms: z.coerce.number().int().min(1).max(6).default(1),
    extras: z.array(shortText(80)).max(12).default([]),
    estimatedTotal: shortText(40).optional().or(z.literal("")),
    guest: z.object({
      firstName: shortText(80).min(1),
      lastName: shortText(80).min(1),
      email: z.string().trim().email().max(160),
      phone: shortText(40).min(5),
    }),
    arrivalTime: shortText(40).optional().or(z.literal("")),
    requests: shortText(1000).optional().or(z.literal("")),
    marketingOptIn: z.boolean().default(false),
    /** Honeypot: real guests never see or fill this field. The route ignores requests that fill it. */
    company: z.string().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    const inDate = new Date(`${value.checkIn}T00:00:00Z`);
    const outDate = new Date(`${value.checkOut}T00:00:00Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) return;
    if (inDate < today) ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Check-in can't be in the past." });
    if (outDate <= inDate) ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out must be after check-in." });
    if (nightsBetween(value.checkIn, value.checkOut) > 60) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: "For stays over 60 nights, please contact the hotel." });
    }
  });

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Human-friendly reference, e.g. REQ-7K4Q2M. Avoids 0/O and 1/I. */
export function bookingReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "";
  for (let i = 0; i < 6; i++) ref += alphabet[randomInt(alphabet.length)];
  return `REQ-${ref}`;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function stayLines(req: BookingRequest) {
  const nights = nightsBetween(req.checkIn, req.checkOut);
  const guests = `${req.adults} adult${req.adults === 1 ? "" : "s"}${req.children ? `, ${req.children} child${req.children === 1 ? "" : "ren"}` : ""}`;
  return [
    ["Room", `${req.room}${req.rooms > 1 ? ` × ${req.rooms}` : ""}`],
    ["Rate", req.ratePlan || "Not specified"],
    ["Check-in", formatDate(req.checkIn)],
    ["Check-out", `${formatDate(req.checkOut)} (${nights} night${nights === 1 ? "" : "s"})`],
    ["Guests", guests],
    ["Extras", req.extras.length ? req.extras.join(", ") : "None"],
    ["Estimated total", req.estimatedTotal || "Not shown"],
  ] as const;
}

function table(rows: ReadonlyArray<readonly [string, string]>) {
  return `<table style="border-collapse:collapse;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><th align="left" style="padding:6px 16px 6px 0;vertical-align:top">${escapeHtml(k)}</th><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`
    )
    .join("")}</table>`;
}

/** Email to the hotel: everything the reservations team needs to check and reply. */
export function hotelEmail(req: BookingRequest, reference: string, hotelName: string) {
  const guestName = `${req.guest.firstName} ${req.guest.lastName}`;
  const rows = [
    ...stayLines(req),
    ["Guest", guestName],
    ["Email", req.guest.email],
    ["Phone", req.guest.phone],
    ["Arrival time", req.arrivalTime || "Not given"],
    ["Special requests", req.requests || "None"],
    ["Marketing emails", req.marketingOptIn ? "Yes, opted in" : "No"],
  ] as const;
  const subject = `New booking request ${reference}: ${req.room}, ${formatDate(req.checkIn)}`;
  const text = [
    `New booking request for ${hotelName} (${reference}). No payment has been taken and nothing is reserved yet.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Check availability, then reply to the guest to confirm or suggest alternatives. Replying to this email goes to the guest.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#1b1f1c">
    <h2 style="margin:0 0 8px">New booking request ${escapeHtml(reference)}</h2>
    <p style="margin:0 0 16px">For ${escapeHtml(hotelName)}. <strong>No payment has been taken and nothing is reserved yet.</strong></p>
    ${table(rows)}
    <p style="margin:16px 0 0">Check availability, then reply to the guest to confirm or suggest alternatives. Replying to this email goes to the guest.</p>
  </div>`;
  return { subject, text, html };
}

/**
 * Acknowledgement to the guest. Deliberately excludes the free-text "special requests"
 * so the form can't be used to send arbitrary content to arbitrary inboxes.
 */
export function guestEmail(req: BookingRequest, reference: string, hotelName: string) {
  const subject = `We've received your booking request (${reference})`;
  const intro = `Thank you, ${req.guest.firstName}. ${hotelName} has received your booking request. This is not a confirmation yet: the team will check availability and email you to confirm. No payment has been taken.`;
  const rows = stayLines(req);
  const text = [intro, "", `Reference: ${reference}`, ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#1b1f1c">
    <h2 style="margin:0 0 8px">Booking request received</h2>
    <p style="margin:0 0 16px">${escapeHtml(intro)}</p>
    <p style="margin:0 0 8px"><strong>Reference:</strong> ${escapeHtml(reference)}</p>
    ${table(rows)}
  </div>`;
  return { subject, text, html };
}
