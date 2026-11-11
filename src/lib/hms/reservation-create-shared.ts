/* Booking choices shared by the new-booking screen and its route. Safe for the browser. */

/** The sources every hotel starts with. A hotel can add its own (see booking-options). */
export const BOOKING_SOURCES = ["phone", "walk_in", "referral", "travel_agent", "website", "ota", "airbnb", "e_guest", "e_commerce"] as const;
export type BuiltInBookingSource = (typeof BOOKING_SOURCES)[number];
/** A built-in value or one of the hotel's own. */
export type BookingSource = string;
export const BOOKING_SOURCE_LABEL: Record<string, string> = {
  phone: "Phone call",
  walk_in: "Walked in",
  referral: "Referral",
  travel_agent: "Travel agent",
  website: "Hotel website",
  ota: "Booking site",
  airbnb: "Airbnb",
  e_guest: "E-guest",
  e_commerce: "E-commerce",
};

/** The segments every hotel starts with. A hotel can add its own (see booking-options). */
export const MARKET_SEGMENTS = ["transient", "corporate", "group", "government", "wholesale", "hotel_booking"] as const;
export type BuiltInMarketSegment = (typeof MARKET_SEGMENTS)[number];
/** A built-in value or one of the hotel's own. */
export type MarketSegment = string;

export const MARKET_SEGMENT_LABEL: Record<string, string> = {
  transient: "Transient",
  corporate: "Corporate",
  group: "Group",
  government: "Government",
  wholesale: "Wholesale",
  hotel_booking: "Hotel booking",
};
