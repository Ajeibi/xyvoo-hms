/* Booking choices shared by the new-booking screen and its route. Safe for the browser. */

export const BOOKING_SOURCES = ["phone", "walk_in", "referral", "travel_agent", "website", "ota"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];
export const BOOKING_SOURCE_LABEL: Record<BookingSource, string> = {
  phone: "Phone call",
  walk_in: "Walked in",
  referral: "Referral",
  travel_agent: "Travel agent",
  website: "Hotel website",
  ota: "Booking site",
};

export const MARKET_SEGMENTS = ["transient", "corporate", "group", "government", "wholesale"] as const;
export type MarketSegment = (typeof MARKET_SEGMENTS)[number];
