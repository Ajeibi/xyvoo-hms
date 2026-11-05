import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDayLong } from "@/lib/hms/reservation-availability-shared";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { badge, detailsPanel } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";

/*
 * Emails for a booking made on the hotel's website: the confirmation the guest keeps (with the
 * deposit, how to pay it, the cancellation terms and a link to change or cancel), and the one
 * reminder to a visitor who left halfway. Each confirmation is written to the same log as the
 * front desk's emails, so staff see it on the booking.
 */

export type WebConfirmation = {
  tenantId: string;
  reservationId: string;
  to: string;
  guestName: string;
  hotelName: string;
  code: string;
  roomName: string;
  planName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  party: string;
  currency: string;
  /** For this room. */
  total: number;
  deposit: number;
  depositDue: string | null;
  paymentNote: string | null;
  cancellation: string[];
  addons: { name: string; amount: number }[];
  manageUrl: string | null;
  replyTo: string | null;
  /** Several rooms in one booking: say so. */
  alsoBooked: string[];
};

export async function sendWebConfirmation(db: SupabaseClient, c: WebConfirmation): Promise<boolean> {
  const money = (n: number) => formatPricingAmount(n, c.currency);
  const rows = [
    { label: "Booking", value: c.code },
    { label: "Room", value: c.roomName },
    { label: "Rate", value: c.planName },
    { label: "Arrival", value: formatDayLong(c.checkIn) },
    { label: "Departure", value: formatDayLong(c.checkOut) },
    { label: "Nights", value: String(c.nights) },
    { label: "Guests", value: c.party },
    ...c.addons.map((a) => ({ label: a.name, value: money(a.amount) })),
    { label: "Total for the stay", value: `${money(c.total)} (taxes included)` },
  ];
  if (c.deposit > 0) rows.push({ label: "Deposit asked", value: `${money(c.deposit)}${c.depositDue ? `, by ${formatDayLong(c.depositDue)}` : ""}` });
  const extra: string[] = [];
  if (c.deposit > 0) extra.push(c.paymentNote ? `How to pay your deposit\n${c.paymentNote}` : `The hotel will contact you about the deposit. Quote ${c.code} when you pay.`);
  else extra.push("Nothing is charged online. You pay the hotel when you stay.");
  if (c.cancellation.length) extra.push(["Cancellation policy", ...c.cancellation].join("\n"));
  if (c.alsoBooked.length) extra.push(`Booked together: ${c.alsoBooked.join(", ")}. You will get an email for each room.`);

  const intro = `Hello ${c.guestName}, your booking at ${c.hotelName} is confirmed. We look forward to welcoming you.`;
  const subject = `Your booking at ${c.hotelName} is confirmed (${c.code})`;
  const text = [intro, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", ...extra.flatMap((e) => [e, ""]), c.manageUrl ? `Change or cancel: ${c.manageUrl}` : "", c.hotelName].join("\n");
  const notes = extra
    .map((e) => `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#475569;white-space:pre-line">${e.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
    .join("");

  let status: "sent" | "failed" = "sent";
  let error: string | undefined;
  try {
    await sendBrandedEmail({
      to: c.to,
      subject,
      text,
      replyTo: c.replyTo,
      layout: {
        preheader: `${c.hotelName}: ${formatDayLong(c.checkIn)} to ${formatDayLong(c.checkOut)}. Booking ${c.code}.`,
        badges: [badge("Confirmed", "green")],
        title: "Your booking is confirmed",
        intro,
        body: `${detailsPanel(rows)}${notes}`,
        buttons: c.manageUrl ? [{ label: "Change or cancel your booking", href: c.manageUrl, variant: "secondary" }] : undefined,
        footerNote: `You are receiving this because you booked on ${c.hotelName}'s website. Quote ${c.code} if you contact us.`,
      },
    });
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message.slice(0, 300) : "The email could not be sent.";
    console.warn("[web-booking] confirmation email failed", error);
  }
  await db
    .schema("hotel")
    .from("reservation_emails")
    .insert({ tenant_id: c.tenantId, reservation_id: c.reservationId, kind: "confirmation", to_email: c.to, subject: status === "sent" ? subject : null, status, error: error ?? null, sent_by: null })
    .then(
      () => undefined,
      () => undefined,
    );
  return status === "sent";
}

/** The one reminder to a visitor who gave an email and left. */
export async function sendAbandonedReminder(input: {
  to: string;
  firstName: string | null;
  hotelName: string;
  checkIn: string | null;
  checkOut: string | null;
  resumeUrl: string;
  replyTo: string | null;
}): Promise<void> {
  const dates = input.checkIn && input.checkOut ? `${formatDayLong(input.checkIn)} to ${formatDayLong(input.checkOut)}` : null;
  const intro = `${input.firstName ? `Hello ${input.firstName}, you` : "You"} started a booking at ${input.hotelName}${dates ? ` for ${dates}` : ""} and didn't finish. Rooms and prices change, so check them again and book if you still want to stay.`;
  await sendBrandedEmail({
    to: input.to,
    subject: `Still thinking about ${input.hotelName}?`,
    text: `${intro}\n\nPick up where you left off: ${input.resumeUrl}\n\nYou are getting this once because you gave your email while booking. Nothing was charged.`,
    replyTo: input.replyTo,
    layout: {
      preheader: dates ? `Your stay ${dates} is waiting.` : "Your booking is waiting.",
      title: "Pick up where you left off",
      intro,
      buttons: [{ label: "Check rooms and prices", href: input.resumeUrl }],
      footerNote: "You are getting this one email because you gave your address while booking on the hotel's website. Nothing was charged and nothing is held.",
    },
  });
}
