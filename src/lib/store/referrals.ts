import { z } from "zod";

/*
 * Referrals: the shop's rules for "tell a friend". No server code, so the
 * dashboard, the account page and the checks share one set of words and sums.
 */

export type ReferralSettings = {
  enabled: boolean;
  /** What the friend gets off a first order. */
  friendKind: "percent" | "fixed";
  friendValue: number;
  /** The least the friend must spend on items for the reward to be paid (0 for no minimum). */
  minOrder: number;
  /** What the customer who shared the code gets. */
  rewardKind: "points" | "gift_card";
  /** Points, or a gift card amount in the shop's currency. */
  rewardValue: number;
  /** How many rewards one customer can earn in a calendar month. */
  maxPerMonth: number;
};

export const DEFAULT_REFERRALS: ReferralSettings = { enabled: false, friendKind: "percent", friendValue: 10, minOrder: 0, rewardKind: "points", rewardValue: 500, maxPerMonth: 10 };

const number = (message: string, min: number, max: number, whole = false) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (v === "" ? Number.NaN : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= min && v <= max && (!whole || Number.isInteger(v)), message);

export const referralSettingsSchema = z
  .object({
    enabled: z.boolean(),
    friendKind: z.enum(["percent", "fixed"]),
    friendValue: number("The friend's offer must be more than 0.", 0.01, 100_000_000),
    minOrder: number("The least a friend must spend must be 0 or more.", 0, 100_000_000),
    rewardKind: z.enum(["points", "gift_card"]),
    rewardValue: number("The reward must be more than 0.", 0.01, 100_000_000),
    maxPerMonth: number("Rewards per customer each month must be a whole number from 0 to 1,000.", 0, 1000, true),
  })
  .superRefine((s, ctx) => {
    if (s.friendKind === "percent" && s.friendValue > 100) ctx.addIssue({ code: "custom", path: ["friendValue"], message: "A percentage can't be more than 100." });
    if (s.rewardKind === "points" && !Number.isInteger(s.rewardValue)) ctx.addIssue({ code: "custom", path: ["rewardValue"], message: "Points must be a whole number." });
  });

export function referralSettings(raw: unknown): ReferralSettings {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (k: string, d: number) => (typeof v[k] === "number" && Number.isFinite(v[k] as number) ? (v[k] as number) : d);
  return {
    enabled: v.enabled === true,
    friendKind: v.friendKind === "fixed" ? "fixed" : "percent",
    friendValue: num("friendValue", DEFAULT_REFERRALS.friendValue),
    minOrder: num("minOrder", DEFAULT_REFERRALS.minOrder),
    rewardKind: v.rewardKind === "gift_card" ? "gift_card" : "points",
    rewardValue: num("rewardValue", DEFAULT_REFERRALS.rewardValue),
    maxPerMonth: num("maxPerMonth", DEFAULT_REFERRALS.maxPerMonth),
  };
}

/** "10% off a first order", "₦2,000 off a first order over ₦10,000". */
export function friendOfferText(s: ReferralSettings, money: (n: number) => string) {
  const amount = s.friendKind === "percent" ? `${s.friendValue}% off` : `${money(s.friendValue)} off`;
  return `${amount} their first order${s.minOrder > 0 ? ` over ${money(s.minOrder)}` : ""}`;
}

/** "500 loyalty points", "a ₦2,000 gift card". */
export function rewardText(s: Pick<ReferralSettings, "rewardKind" | "rewardValue">, money: (n: number) => string) {
  return s.rewardKind === "points" ? `${s.rewardValue.toLocaleString("en-GB")} loyalty points` : `a ${money(s.rewardValue)} gift card`;
}

const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A short personal code like FRIEND-7KQM2X, without look-alike characters. */
export function newReferralCode(random: (max: number) => number = (n) => Math.floor(Math.random() * n)) {
  let tail = "";
  for (let i = 0; i < 6; i += 1) tail += CODE_LETTERS[random(CODE_LETTERS.length)];
  return `FRIEND-${tail}`;
}

/**
 * Whether a friend may use a referral code: only on a first order, and not with
 * the sharer's own email address. `paidOrders` counts the friend's earlier paid orders.
 */
export function referralCodeProblem(opts: { friendEmail: string; referrerEmail: string; paidOrders: number }) {
  if (opts.friendEmail.trim().toLowerCase() === opts.referrerEmail.trim().toLowerCase()) return "You can't use your own friend code. Share it with a friend instead.";
  if (opts.paidOrders > 0) return "That code is for a first order only. Thank you for coming back to the shop!";
  return null;
}
