/*
 * The price-suggestion rule, with no database. For one room type and one night it compares the
 * rooms sold with how many a hotel usually has sold that far ahead, looks at how fast bookings came
 * in over the last week, and proposes a higher or lower price inside the limits the hotel set.
 * Nothing here changes a price: a person accepts or dismisses each suggestion.
 */

/** Share of rooms usually sold N days before the night: [daysOut, share]. Between points it is a straight line. */
export const BOOKING_CURVE: [number, number][] = [
  [0, 0.92],
  [1, 0.9],
  [3, 0.82],
  [7, 0.7],
  [14, 0.55],
  [30, 0.35],
  [60, 0.2],
  [90, 0.1],
];

export function expectedShare(daysOut: number): number {
  if (daysOut <= BOOKING_CURVE[0][0]) return BOOKING_CURVE[0][1];
  const last = BOOKING_CURVE[BOOKING_CURVE.length - 1];
  if (daysOut >= last[0]) return last[1];
  for (let i = 1; i < BOOKING_CURVE.length; i += 1) {
    const [d1, s1] = BOOKING_CURVE[i];
    const [d0, s0] = BOOKING_CURVE[i - 1];
    if (daysOut <= d1) return s0 + ((s1 - s0) * (daysOut - d0)) / (d1 - d0);
  }
  return last[1];
}

export type SuggestionLimits = {
  /** The biggest change in one step, as a percentage of today's price. */
  maxStepPercent: number;
  /** The price never goes below this percentage of the Settings price. */
  floorPercent: number;
  /** The price never goes above this percentage of the Settings price. */
  ceilingPercent: number;
};

export type SuggestionInput = {
  daysOut: number;
  stock: number;
  /** Rooms sold plus rooms held for groups. */
  taken: number;
  /** Room nights for this night booked in the last 7 days. */
  pickup: number;
  currentPrice: number;
  /** The room type's price in Settings, the anchor for the floor and ceiling. */
  basePrice: number;
  limits: SuggestionLimits;
};

export type Suggestion = {
  suggestedPrice: number;
  changePercent: number;
  occupancyPercent: number;
  expectedPercent: number;
  reason: string;
};

function roundNice(price: number): number {
  const step = price >= 20000 ? 500 : price >= 2000 ? 100 : 10;
  return Math.max(0, Math.round(price / step) * step);
}

const pct = (n: number) => Math.round(n * 1000) / 10;

export function suggestPrice(i: SuggestionInput): Suggestion | null {
  if (i.stock <= 0 || i.currentPrice <= 0 || i.basePrice <= 0 || i.daysOut < 0) return null;
  const free = i.stock - i.taken;
  if (free <= 0) return null; // already full: nothing to gain from a different price
  const occupancy = Math.min(1, i.taken / i.stock);
  const expected = expectedShare(i.daysOut);
  const diff = occupancy - expected;
  const pickupShare = i.pickup / i.stock;

  let change = 0;
  let why = "";
  if (diff >= 0.12) {
    change = Math.min(i.limits.maxStepPercent, Math.max(3, diff * 50));
    why = `${i.taken} of ${i.stock} rooms are sold (${pct(occupancy)}%) for a night ${i.daysOut} day${i.daysOut === 1 ? "" : "s"} away, ahead of the ${pct(expected)}% the booking curve expects by now.`;
    if (pickupShare >= 0.2) {
      change = Math.min(i.limits.maxStepPercent, change + 3);
      why += ` ${i.pickup} room${i.pickup === 1 ? "" : "s"} were booked in the last 7 days.`;
    }
  } else if (diff <= -0.2 && i.daysOut <= 21) {
    change = -Math.min(i.limits.maxStepPercent, Math.max(3, Math.abs(diff) * 40));
    why = `Only ${i.taken} of ${i.stock} rooms are sold (${pct(occupancy)}%) for a night ${i.daysOut} day${i.daysOut === 1 ? "" : "s"} away, behind the ${pct(expected)}% the booking curve expects by now.`;
    if (i.pickup === 0) why += " Nothing was booked for it in the last 7 days.";
  } else {
    return null;
  }

  const floor = (i.basePrice * i.limits.floorPercent) / 100;
  const ceiling = (i.basePrice * i.limits.ceilingPercent) / 100;
  const target = roundNice(Math.min(ceiling, Math.max(floor, i.currentPrice * (1 + change / 100))));
  const actual = ((target - i.currentPrice) / i.currentPrice) * 100;
  if (Math.abs(actual) < 2) return null;
  const capped = (change > 0 && target >= ceiling) || (change < 0 && target <= floor);
  return {
    suggestedPrice: target,
    changePercent: Math.round(actual * 10) / 10,
    occupancyPercent: pct(occupancy),
    expectedPercent: pct(expected),
    reason: `${why} ${actual > 0 ? "Raise" : "Lower"} the price by ${Math.abs(Math.round(actual * 10) / 10)}%${capped ? ", the limit you set" : ""}.`,
  };
}
