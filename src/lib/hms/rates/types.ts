/*
 * Rate plans, price rules and restrictions. Safe for the browser and the server: nothing here reads
 * the database. Days of the week are numbered 0 (Sunday) to 6 (Saturday), the way JavaScript counts them.
 */

export const CHANNELS = ["front_desk", "website", "partner", "corporate"] as const;
export type RateChannel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<RateChannel, string> = {
  front_desk: "Front desk and phone",
  website: "Hotel website",
  partner: "Booking sites (Booking.com, Expedia…)",
  corporate: "Company bookings",
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type RatePlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentPlanId: string | null;
  deriveKind: "percent" | "amount" | null;
  deriveValue: number;
  boardBasis: string;
  refundable: boolean;
  prepayRequired: boolean;
  /** Null means every room type. */
  roomTypeCodes: string[] | null;
  channels: string[];
  arCustomerId: string | null;
  sellFrom: string | null;
  sellTo: string | null;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
};

export type PriceRule = {
  id: string;
  ratePlanId: string;
  /** Null means every room type. */
  roomTypeCode: string | null;
  dateFrom: string;
  dateTo: string;
  /** Null means every day. */
  daysOfWeek: number[] | null;
  price: number;
  priority: number;
  label: string | null;
  source: "manual" | "suggestion";
  createdAt: string;
};

export type Restriction = {
  id: string;
  /** Null means every plan. */
  ratePlanId: string | null;
  roomTypeCode: string | null;
  dateFrom: string;
  dateTo: string;
  daysOfWeek: number[] | null;
  minStay: number | null;
  maxStay: number | null;
  closed: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  minAdvanceDays: number | null;
  maxAdvanceDays: number | null;
  note: string | null;
};

export type RateRoomType = { id: string; name: string; baseRate: number; maxOccupancy: number };

export type RateBook = {
  currency: string;
  extraAdultRate: number;
  extraChildRate: number;
  roomTypes: RateRoomType[];
  plans: RatePlan[];
  prices: PriceRule[];
  restrictions: Restriction[];
};

export type NightSource = "rule" | "derived" | "base_rate";

export type NightPrice = {
  date: string;
  /** The room price for the night before any extra-person charge. */
  base: number;
  /** Extra adults and children. */
  supplement: number;
  total: number;
  source: NightSource;
  /** The label of the price rule that set it, e.g. "High season". */
  label: string | null;
};

export type IssueKind =
  | "plan_inactive"
  | "plan_window"
  | "plan_room_type"
  | "plan_channel"
  | "plan_company"
  | "min_stay"
  | "max_stay"
  | "closed"
  | "closed_to_arrival"
  | "closed_to_departure"
  | "min_advance"
  | "max_advance"
  | "occupancy";

export type RateIssue = { kind: IssueKind; message: string; date?: string };
