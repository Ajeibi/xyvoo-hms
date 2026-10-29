/**
 * Happy hours and other time-based prices. Pure functions shared by the
 * server (which fixes the price when an item is ordered) and the POS (which
 * shows the price a guest will pay right now).
 */

export type FbPriceRule = {
  id: string;
  name: string;
  /** null = every outlet. */
  outlet_id: string | null;
  /** Empty = every category. */
  category_ids: string[];
  /** 0 Sunday … 6 Saturday. */
  days: number[];
  /** "HH:MM" in the hotel's time zone. An end before the start runs past midnight. */
  starts_at: string;
  ends_at: string;
  /** Negative = discount (-20 is 20% off), positive = increase. */
  change_percent: number;
  is_active: boolean;
  sort_order: number;
};

/** Day of the week and minute of the day on the hotel's clock. */
export type HotelClock = { day: number; minute: number };

export const FB_PRICE_CHANGE_LIMITS = { min: -90, max: 100 } as const;
export const DEFAULT_FB_TIME_ZONE = "Africa/Lagos";

/** Time zones offered in setup; any valid IANA zone is accepted. */
export const FB_TIME_ZONE_CHOICES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Europe/London",
  "UTC",
] as const;

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function hotelClock(at: Date, timeZone: string): HotelClock {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_FB_TIME_ZONE;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** "17:30" or "17:30:00" → 1050. NaN when not a time. */
export function timeToMinute(value: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return Number.NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return Number.NaN;
  return h * 60 + min;
}

/** "17:30:00" → "17:30" (the database returns seconds). */
export function shortTime(value: string) {
  return value.slice(0, 5);
}

/** Whether the rule is running at this moment on the hotel's clock. */
export function ruleIsOn(rule: Pick<FbPriceRule, "days" | "starts_at" | "ends_at" | "is_active">, clock: HotelClock) {
  if (!rule.is_active) return false;
  const start = timeToMinute(rule.starts_at);
  const end = timeToMinute(rule.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return false;
  if (start < end) {
    return rule.days.includes(clock.day) && clock.minute >= start && clock.minute < end;
  }
  // Runs past midnight: the late part belongs to the day it started.
  const yesterday = (clock.day + 6) % 7;
  return (rule.days.includes(clock.day) && clock.minute >= start) || (rule.days.includes(yesterday) && clock.minute < end);
}

export function ruleCoversItem(
  rule: Pick<FbPriceRule, "outlet_id" | "category_ids">,
  item: { outlet_id: string; category_id: string | null },
) {
  if (rule.outlet_id && rule.outlet_id !== item.outlet_id) return false;
  if (rule.category_ids.length && (!item.category_id || !rule.category_ids.includes(item.category_id))) return false;
  return true;
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;

export function applyChange(listPrice: number, changePercent: number) {
  return Math.max(0, roundMoney(listPrice * (1 + changePercent / 100)));
}

export type RuledPrice = {
  price: number;
  /** The menu price before the rule (with choices). */
  listPrice: number;
  rule: Pick<FbPriceRule, "id" | "name" | "change_percent"> | null;
};

/**
 * The price for one unit right now. `listPrice` is the menu price including
 * choices. When several rules apply, the guest gets the lowest price; ties go
 * to the rule listed first.
 */
export function priceWithRules(
  listPrice: number,
  item: { outlet_id: string; category_id: string | null },
  rules: FbPriceRule[],
  clock: HotelClock,
): RuledPrice {
  let best: RuledPrice = { price: listPrice, listPrice, rule: null };
  const ordered = [...rules].sort((a, b) => a.sort_order - b.sort_order);
  for (const rule of ordered) {
    if (!ruleIsOn(rule, clock) || !ruleCoversItem(rule, item)) continue;
    const price = applyChange(listPrice, rule.change_percent);
    if (best.rule === null || price < best.price) {
      best = { price, listPrice, rule: { id: rule.id, name: rule.name, change_percent: rule.change_percent } };
    }
  }
  return best;
}

/** "20% off" or "10% extra". */
export function changeLabel(changePercent: number) {
  const n = Math.abs(changePercent);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return changePercent < 0 ? `${text}% off` : `${text}% extra`;
}

/** "Mon–Fri", "Every day", "Fri, Sat" … */
export function daysLabel(days: number[]) {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return "Every day";
  if (set.join() === "1,2,3,4,5") return "Mon–Fri";
  if (set.join() === "0,6") return "Weekends";
  return set.map((d) => DAY_SHORT[d]).join(", ");
}

/** "Mon–Fri 17:00–19:00" (adds "next day" when the end is past midnight). */
export function scheduleLabel(rule: Pick<FbPriceRule, "days" | "starts_at" | "ends_at">) {
  const start = shortTime(rule.starts_at);
  const end = shortTime(rule.ends_at);
  const overnight = timeToMinute(rule.ends_at) < timeToMinute(rule.starts_at);
  return `${daysLabel(rule.days)} ${start}–${end}${overnight ? " (next day)" : ""}`;
}

export type FbPriceRuleInput = {
  name: string;
  outletId: string | null;
  categoryIds: string[];
  days: number[];
  startsAt: string;
  endsAt: string;
  changePercent: number;
  isActive: boolean;
};

/** Checks a rule before it is saved. Returns a message a manager can act on, or null. */
export function validatePriceRule(input: FbPriceRuleInput): string | null {
  if (!input.name.trim()) return "Give the price rule a name, e.g. Happy hour.";
  if (input.name.trim().length > 60) return "Keep the name to 60 characters.";
  if (!input.days.length) return "Choose at least one day.";
  if (input.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Choose days from Sunday to Saturday.";
  const start = timeToMinute(input.startsAt);
  const end = timeToMinute(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Enter a start and end time.";
  if (start === end) return "The start and end times can't be the same.";
  if (!Number.isFinite(input.changePercent) || input.changePercent === 0) return "Enter the price change, e.g. 20% off.";
  if (input.changePercent < FB_PRICE_CHANGE_LIMITS.min) return `A discount can be up to ${-FB_PRICE_CHANGE_LIMITS.min}% off.`;
  if (input.changePercent > FB_PRICE_CHANGE_LIMITS.max) return `An increase can be up to ${FB_PRICE_CHANGE_LIMITS.max}%.`;
  return null;
}
