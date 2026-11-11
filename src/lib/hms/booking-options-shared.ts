/*
 * Booking sources and market segments. A hotel keeps the built-in values and may add its own.
 * A stay stores the option's `value` (a stable key); the label can be renamed without touching old
 * stays. Safe for the browser: no server imports.
 */
import {
  BOOKING_SOURCES,
  BOOKING_SOURCE_LABEL,
  MARKET_SEGMENTS,
  MARKET_SEGMENT_LABEL,
} from "@/lib/hms/reservation-create-shared";

export type BookingOptionKind = "source" | "segment";

export type BookingOption = {
  /** What is stored on the stay. */
  value: string;
  label: string;
  builtIn: boolean;
  isActive: boolean;
  /** Row id for a hotel's own option; absent for built-ins. */
  id?: string;
};

/** A hotel's own options as stored: value to label, active or not. */
export type CustomBookingOption = { id: string; kind: BookingOptionKind; value: string; label: string; isActive: boolean };

export const BUILT_IN_SOURCE_VALUES: readonly string[] = BOOKING_SOURCES;
export const BUILT_IN_SEGMENT_VALUES: readonly string[] = MARKET_SEGMENTS;

/** The wording the check-in form has always used for sources (shorter than the reservation form's). */
const CHECK_IN_SOURCE_LABEL: Record<string, string> = {
  walk_in: "Walk-in",
  phone: "Phone",
  referral: "Referral",
  ota: "OTA",
  airbnb: "Airbnb",
  e_guest: "E-guest",
  e_commerce: "E-commerce",
  website: "Website",
  travel_agent: "Travel agent",
};

export function isBuiltIn(kind: BookingOptionKind, value: string): boolean {
  return (kind === "source" ? BUILT_IN_SOURCE_VALUES : BUILT_IN_SEGMENT_VALUES).includes(value);
}

/** "corporate_events" to "Corporate events": what we show when a value is in nobody's list. */
export function prettifyOptionValue(value: string): string {
  const t = value.replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : value;
}

/** A stable key from a name. Lower case letters, digits and underscores. */
export function optionValueFromLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * The options for a pick-list: the built-ins first, then the hotel's own. `style` picks which wording the
 * built-in sources use ("reservation" is the new-booking form's, "check_in" the desk form's).
 * Switched-off custom options are left out unless `keep` names one a stay already uses.
 */
export function mergeBookingOptions(
  kind: BookingOptionKind,
  custom: CustomBookingOption[],
  opts?: { style?: "reservation" | "check_in"; keep?: string | null; includeInactive?: boolean },
): BookingOption[] {
  const style = opts?.style ?? "reservation";
  const builtIns: BookingOption[] =
    kind === "source"
      ? (style === "check_in" ? Object.keys(CHECK_IN_SOURCE_LABEL) : [...BOOKING_SOURCES]).map((v) => ({
          value: v,
          label: style === "check_in" ? CHECK_IN_SOURCE_LABEL[v] : BOOKING_SOURCE_LABEL[v] ?? prettifyOptionValue(v),
          builtIn: true,
          isActive: true,
        }))
      : MARKET_SEGMENTS.map((v) => ({ value: v, label: MARKET_SEGMENT_LABEL[v], builtIn: true, isActive: true }));
  const own: BookingOption[] = custom
    .filter((c) => c.kind === kind && (c.isActive || opts?.includeInactive || c.value === opts?.keep))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((c) => ({ value: c.value, label: c.label, builtIn: false, isActive: c.isActive, id: c.id }));
  const out = [...builtIns, ...own];
  // A stay can carry a value that is in no list any more; keep showing it rather than blanking the field.
  if (opts?.keep && !out.some((o) => o.value === opts.keep)) {
    out.push({ value: opts.keep, label: prettifyOptionValue(opts.keep), builtIn: false, isActive: false });
  }
  return out;
}

/** The label to show for a stored value: built-in wording, then the hotel's own (even if switched off), then a tidy version of the key. */
export function bookingOptionLabel(
  kind: BookingOptionKind,
  value: string | null | undefined,
  custom: CustomBookingOption[] | Record<string, string> = [],
): string {
  if (!value) return "";
  const builtIn = kind === "source" ? BOOKING_SOURCE_LABEL[value] : MARKET_SEGMENT_LABEL[value];
  if (builtIn) return builtIn;
  if (Array.isArray(custom)) {
    const found = custom.find((c) => c.kind === kind && c.value === value);
    if (found) return found.label;
  } else if (custom[value]) {
    return custom[value];
  }
  return prettifyOptionValue(value);
}
