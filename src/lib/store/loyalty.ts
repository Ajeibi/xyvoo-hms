import { z } from "zod";

/*
 * Loyalty points: the rules for earning and spending. No server code, so the
 * dashboard, checkout and account page all use the same sums. The database
 * applies the same rules when it records points (see the loyalty migration).
 */

export type LoyaltySettings = {
  enabled: boolean;
  /** Points earned for every 100 spent on items. */
  pointsPer100: number;
  /** What one point is worth, in the shop's home currency. */
  pointValue: number;
  /** The fewest points that can be used at once (0 for no minimum). */
  minRedeem: number;
  /** Months without activity before points expire (0 for never). */
  expiryMonths: number;
};

export const DEFAULT_LOYALTY: LoyaltySettings = { enabled: false, pointsPer100: 1, pointValue: 1, minRedeem: 0, expiryMonths: 0 };

const whole = (min: number, max: number, message: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (v === "" ? Number.NaN : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= min && v <= max, message);

export const loyaltySettingsSchema = z.object({
  enabled: z.boolean(),
  pointsPer100: z
    .union([z.number(), z.string()])
    .transform((v) => (v === "" ? Number.NaN : Number(v)))
    .refine((v) => Number.isFinite(v) && v > 0 && v <= 100, "Points for every 100 spent must be more than 0 and no more than 100."),
  pointValue: z
    .union([z.number(), z.string()])
    .transform((v) => (v === "" ? Number.NaN : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= 0.01 && v <= 1000, "A point must be worth between 0.01 and 1,000."),
  minRedeem: whole(0, 100_000, "The fewest points to use must be a whole number from 0 to 100,000."),
  expiryMonths: whole(0, 60, "Months before points expire must be a whole number from 0 to 60."),
});

/** The shop's saved settings, filling anything missing with the defaults. */
export function loyaltySettings(raw: unknown): LoyaltySettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (k: string, d: number) => (typeof value[k] === "number" && Number.isFinite(value[k] as number) ? (value[k] as number) : d);
  return {
    enabled: value.enabled === true,
    pointsPer100: num("pointsPer100", DEFAULT_LOYALTY.pointsPer100),
    pointValue: num("pointValue", DEFAULT_LOYALTY.pointValue),
    minRedeem: num("minRedeem", DEFAULT_LOYALTY.minRedeem),
    expiryMonths: num("expiryMonths", DEFAULT_LOYALTY.expiryMonths),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Points earned on an amount spent on items (after discounts), rounded down. */
export function pointsEarned(settings: LoyaltySettings, itemsAfterDiscount: number) {
  if (!settings.enabled) return 0;
  return Math.max(0, Math.floor((Math.max(itemsAfterDiscount, 0) / 100) * settings.pointsPer100));
}

/** What a number of points is worth in money. */
export function pointsValue(settings: LoyaltySettings, points: number) {
  return round2(Math.max(points, 0) * settings.pointValue);
}

/**
 * How many points can be used on an order: not more than the balance, and not
 * more than the order is worth. Zero if that is under the shop's minimum.
 */
export function redeemablePoints(settings: LoyaltySettings, balance: number, orderTotal: number) {
  if (!settings.enabled || balance <= 0 || orderTotal <= 0) return 0;
  const usable = Math.min(balance, Math.floor(orderTotal / settings.pointValue));
  return usable >= Math.max(settings.minRedeem, 1) ? usable : 0;
}

export type LoyaltyReason = "earned" | "redeemed" | "returned" | "reversed" | "adjusted" | "expired";

export const LOYALTY_REASON_LABELS: Record<LoyaltyReason, string> = {
  earned: "Earned on an order",
  redeemed: "Used on an order",
  returned: "Given back (order cancelled)",
  reversed: "Taken back (order cancelled or refunded)",
  adjusted: "Added or removed by the shop",
  expired: "Expired",
};

export const adjustSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter the customer's email address."),
  points: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v !== 0 && Math.abs(v) <= 100_000, "Enter a whole number of points, more or less than zero."),
  note: z.string().trim().min(1, "Say why, so there is a record.").max(200, "Keep the reason under 200 characters."),
});
