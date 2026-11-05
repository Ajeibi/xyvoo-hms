import { z } from "zod";

/*
 * Rules shared by the website's price, booking and manage-booking routes. Nothing here reads the
 * database, so it is easy to test. The prices themselves always come from the rate book's priceStay.
 */

/** Plans the website may not sell: switched off, another channel, a company's rate. They are left out of the page. */
export const NOT_OFFERED = new Set(["plan_inactive", "plan_window", "plan_room_type", "plan_channel", "plan_company"]);

export const MAX_WEB_ROOMS = 4;
export const MAX_WEB_NIGHTS = 60;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");
const text = (max: number) => z.string().trim().max(max);

/** What every price and booking route needs to know about the stay. */
export const stayFields = {
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.coerce.number().int().min(1).max(12),
  children: z.coerce.number().int().min(0).max(12).default(0),
  rooms: z.coerce.number().int().min(1).max(MAX_WEB_ROOMS).default(1),
};

export const webBookingSchema = z.object({
  /** One fresh key per press of "Book": a double-click or a retry gets the first booking back. */
  claimKey: z.string().trim().min(8).max(80),
  /** The visit the booking page was opened in, for the funnel and the abandoned-booking reminder. */
  visit: text(80).optional().or(z.literal("")),
  roomTypeCode: text(120).min(1),
  ratePlan: text(80).optional().or(z.literal("")),
  ...stayFields,
  addons: z.array(z.string().uuid()).max(12).default([]),
  /** The total the guest was shown for the whole booking. If the hotel's price is different now, the guest is asked again. */
  expectedTotal: z.coerce.number().min(0).max(1_000_000_000).optional(),
  guest: z.object({
    firstName: text(80).min(1),
    lastName: text(80).min(1),
    email: z.string().trim().email().max(160),
    phone: text(40).min(5),
  }),
  arrivalTime: text(40).optional().or(z.literal("")),
  requests: text(1000).optional().or(z.literal("")),
  marketingOptIn: z.boolean().default(false),
  /** Honeypot: real guests never see or fill this field. */
  company: z.string().max(200).optional(),
});
export type WebBookingInput = z.infer<typeof webBookingSchema>;

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) / 86_400_000);
}

/** Why these dates can't be asked about, or null when they can. */
export function stayDatesProblem(checkIn: string, checkOut: string, today: string): string | null {
  if (Number.isNaN(Date.parse(checkIn)) || Number.isNaN(Date.parse(checkOut))) return "Choose your dates.";
  if (checkIn < today) return "Check-in can't be in the past.";
  if (checkOut <= checkIn) return "Check-out must be after check-in.";
  if (nightsBetween(checkIn, checkOut) > MAX_WEB_NIGHTS) return "For stays over 60 nights, please contact the hotel.";
  return null;
}

/**
 * Splits the guests of a booking across its rooms, as evenly as possible with at least one adult in
 * each room. Every room is priced and booked for its own party, so a room is never sold for more
 * people than it holds without the price saying so.
 */
export function splitGuests(adults: number, children: number, rooms: number): { adults: number; children: number }[] {
  const n = Math.max(1, rooms);
  const a = Math.max(adults, n);
  return Array.from({ length: n }, (_, i) => ({
    adults: Math.floor(a / n) + (i < a % n ? 1 : 0),
    children: Math.floor(children / n) + (i < children % n ? 1 : 0),
  }));
}

export function money2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Normalised for comparing a guest's email: the booking must belong to whoever types it. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  return x.length > 0 && x === (b ?? "").trim().toLowerCase();
}

/** A booking code as printed in the emails (XYV-...). Keeps only the characters codes use. */
export function cleanCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
}
