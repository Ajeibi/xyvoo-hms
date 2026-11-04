import type { SupabaseClient } from "@supabase/supabase-js";
import { quoteStayAllPlans } from "@/lib/hms/rates/quote";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";

/*
 * A website's booking request names a room and a rate in the page's own words and carries the page's
 * own estimate. The hotel's rate book is what the front desk will charge, so the request email
 * shows what the rate book says for the same stay next to what the guest was shown.
 */

export type WebsiteRateCheck = {
  rows: [string, string][];
  /** True when the guest's estimate is different from the rate book's. */
  mismatch: boolean;
};

type RequestLike = {
  room: string;
  ratePlan?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  estimatedTotal?: string;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const digits = (s: string | undefined) => {
  const n = Number((s ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const money = (n: number, currency: string) => `${currency} ${Math.round(n).toLocaleString("en-US")}`;

export async function websiteRateCheck(
  db: SupabaseClient,
  tenant: { id: string; room_types: unknown; pricing_setup: unknown },
  req: RequestLike,
): Promise<WebsiteRateCheck | null> {
  const type = normalizeRoomTypes(tenant.room_types).find((t) => norm(t.name) === norm(req.room) || t.id === req.room);
  if (!type) return { rows: [["Rate book", `No room type called "${req.room}" in your settings, so this request could not be priced.`]], mismatch: false };

  const quote = await quoteStayAllPlans(db, tenant, {
    roomTypeCode: type.id,
    arrivalDay: req.checkIn,
    departureDay: req.checkOut,
    adults: req.adults,
    children: req.children,
    channel: "website",
  });
  if (!quote.ok) return { rows: [["Rate book", quote.error]], mismatch: false };

  const roomType = quote.roomTypes[0];
  if (!roomType) return null;
  const wanted = req.ratePlan ? norm(req.ratePlan) : "";
  const plan = roomType.plans.find((p) => wanted && (norm(p.planName) === wanted || norm(p.planCode) === wanted)) ?? roomType.plans.find((p) => p.bookable) ?? roomType.plans[0];
  if (!plan) return { rows: [["Rate book", "No rate plan can be sold for these dates."]], mismatch: false };

  const rooms = Math.max(1, req.rooms);
  const total = plan.grandTotal * rooms;
  const rows: [string, string][] = [
    ["Rate book price", `${money(total, quote.currency)} with taxes (${plan.planName}, ${quote.nights} night${quote.nights === 1 ? "" : "s"}${rooms > 1 ? `, ${rooms} rooms` : ""})`],
    ["Rooms left", `${roomType.available} for these dates`],
  ];
  if (!plan.bookable) rows.push(["Can't be booked as asked", plan.issues.map((i) => i.message).join(" ")]);
  const shown = digits(req.estimatedTotal);
  // The page's estimate may or may not include taxes: only call it different if it matches neither.
  const mismatch = shown !== null && Math.abs(shown - total) > 1 && Math.abs(shown - plan.roomTotal * rooms) > 1;
  if (mismatch) rows.push(["Different from what the guest saw", `The guest was shown ${req.estimatedTotal}. Check this before you reply.`]);
  return { rows, mismatch };
}
