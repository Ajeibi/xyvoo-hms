/**
 * Human-friendly guest / stay fixture format for bulk seed generation.
 * See guest-stays.sample.json for a working example.
 *
 * Date fields accept either:
 *   - ISO timestamp: "2026-07-10T14:00:00.000Z"
 *   - Relative: "today+13h", "today-2d", "now-26h", "now+3d+10h"
 *     (today = UTC midnight; now = current instant)
 */

export type GuestStaysSampleFile = {
  /** Documentation only — ignored by loaders. */
  _meta?: {
    description?: string;
    tenant_slug?: string;
    version?: number;
    /** Fixture batch label, e.g. checked_in — used by fix scripts. */
    status_filter?: string;
    /** Human-readable list of valid room codes for this tenant. */
    firefly_room_codes?: string;
  };

  group_bookings?: GroupBookingSample[];

  /** One row per reservation (stay). Duplicate this block to add more guests. */
  stays: StaySample[];
};

export type GroupBookingSample = {
  ref: string;
  group_name: string;
  coordinator_name: string;
  coordinator_phone: string;
  room_count: number;
  shared_billing?: boolean;
  bill_to_account?: string | null;
  arrival: string;
  departure: string;
  notes?: string | null;
};

export type GuestProfileSample = {
  title?: string | null;
  first_name: string;
  last_name: string;
  /** ISO 3166-1 alpha-2, e.g. NG, GH, US */
  nationality: string;
  id_type?: "passport" | "national_id" | "drivers_license";
  id_number: string;
  /** YYYY-MM-DD or relative like "+365d" (from today) */
  id_expiry_date: string;
  /** YYYY-MM-DD or relative like "-35y" (years ago from today) */
  date_of_birth: string;
  gender?: "female" | "male" | "other" | "unspecified" | null;
  phone: string;
  email: string;
  whatsapp?: string | null;
  preferred_channel?: "email" | "phone" | "whatsapp" | "sms";
  tags?: string[];
};

export type StaySample = {
  /** Your reference label — not stored in DB; use for linking companions / folio. */
  ref: string;

  /** confirmed | checked_in | checked_out | cancelled | no_show */
  status: string;

  /** Physical room, e.g. "105". null = unassigned (arrival pending). */
  room_code?: string | null;

  /**
   * Room type id from tenant.room_types[].id — optional if room_code is set
   * (loader can infer from the room row).
   */
  room_type_code?: string | null;

  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  /** Child ages only, e.g. [{ "age": 8 }] */
  children?: { age: number }[];

  purpose_of_visit: "leisure" | "business" | "transit";

  primary_guest: GuestProfileSample;

  /** Additional guests on the same reservation (adults + children). Required when adults > 1 or children present. */
  companions?: Array<{
    guest: GuestProfileSample;
    /** primary | adult | child | infant | spouse | partner | colleague | … */
    relationship?: string | null;
  }>;

  /** Link to group_bookings[].ref */
  group_ref?: string | null;

  booking?: {
    confirmation_code?: string;
    folio_number?: string;
    registration_number?: string;
    rate_type?: "rack" | "corporate" | "walk_in_bar" | "promotional";
    season_code?: string | null;
    rate_per_night: number;
    /** If omitted, nights × rate_per_night */
    total_room_charges?: number;
    settlement_method: "cash" | "card" | "pos" | "split" | "direct_bill" | "partial_credit";
    preauth_amount?: number | null;
    bill_to_account?: string | null;
    booking_channel?: string | null;
    market_segment?: "transient" | "corporate" | "group" | "government" | "wholesale";
    source?: "walk_in" | "phone" | "referral" | "ota" | "website" | "travel_agent";
    travel_agent_name?: string | null;
    vip_flag?: boolean;
    vip_notes?: string | null;
    guest_remarks?: string | null;
    room_preferences?: string | null;
    dietary_notes?: string | null;
    special_occasion?: string | null;
    digital_key_issued?: boolean;
    registration_card_signed?: boolean;
  };

  /** Posted folio lines (charges / payments). Optional. */
  folio?: Array<{
    kind: "charge" | "payment" | "adjustment" | "refund";
    amount: number;
    description: string;
    department?: string;
    method?: string;
    /** Relative or ISO; defaults to arrival/check-in time */
    posted_at?: string;
  }>;
};
