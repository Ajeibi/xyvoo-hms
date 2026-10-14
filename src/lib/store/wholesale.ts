import { z } from "zod";

/*
 * Wholesale (trade accounts): the rules for who gets trade prices and what
 * they cost. No server code, so the basket, checkout, product page and
 * dashboard all work out the same numbers. Checkout works them out again on
 * the server.
 */

export type TradeStatus = "none" | "pending" | "approved" | "declined";

export const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
  none: "Not applied",
  pending: "Waiting for the shop",
  approved: "Trade account",
  declined: "Not approved",
};

export type WholesaleSettings = {
  enabled: boolean;
  /** The least a trade order must come to on items (0 for no minimum). */
  minOrder: number;
  /** Whether discount codes can be used on top of trade prices. */
  allowDiscounts: boolean;
};

export const DEFAULT_WHOLESALE: WholesaleSettings = { enabled: false, minOrder: 0, allowDiscounts: false };

export function wholesaleSettings(raw: unknown): WholesaleSettings {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: v.enabled === true,
    minOrder: typeof v.minOrder === "number" && Number.isFinite(v.minOrder) && v.minOrder >= 0 ? v.minOrder : 0,
    allowDiscounts: v.allowDiscounts === true,
  };
}

export const wholesaleSettingsSchema = z.object({
  enabled: z.boolean(),
  minOrder: z
    .union([z.number(), z.string()])
    .transform((v) => (v === "" ? 0 : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 1_000_000_000, "The smallest trade order must be 0 or more."),
  allowDiscounts: z.boolean(),
});

export const tradeApplicationSchema = z.object({
  business: z.string().trim().min(2, "Tell us the name of your business.").max(120, "Keep the business name under 120 characters."),
  about: z.string().trim().max(500, "Keep this under 500 characters.").optional(),
});

export const tradeDecisionSchema = z.object({
  action: z.enum(["approve", "decline", "revoke"]),
  message: z.string().trim().max(500, "Keep your message under 500 characters.").optional(),
});
export type TradeAction = z.infer<typeof tradeDecisionSchema>["action"];

/** The status a decision leads to, or null if it doesn't apply where the account is now. */
export function nextTradeStatus(status: TradeStatus, action: TradeAction): TradeStatus | null {
  if (action === "approve") return status === "pending" || status === "declined" ? "approved" : null;
  if (action === "decline") return status === "pending" ? "declined" : null;
  return status === "approved" ? "declined" : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What a trade customer pays for one of a product. `unit` is what a retail
 * shopper would pay for this line now (sale and option price included). The
 * trade price applies from the product's minimum quantity; an option priced
 * differently from the product is reduced in the same proportion, and the
 * result is never more than the retail price.
 */
export function tradeUnitPrice(opts: { unit: number; productPrice: number; wholesalePrice: number | null; minQty: number; quantity: number }) {
  const { unit, productPrice, wholesalePrice, minQty, quantity } = opts;
  if (wholesalePrice == null || !(wholesalePrice > 0) || quantity < Math.max(minQty, 1)) return unit;
  const ratio = productPrice > 0 ? wholesalePrice / productPrice : 1;
  return Math.min(unit, round2(unit * ratio));
}

/** "Trade price ₦8,000 each from 10", or "…each" when there is no minimum. */
export function tradePriceText(price: number, minQty: number, money: (n: number) => string) {
  return `Trade price ${money(price)} each${minQty > 1 ? ` from ${minQty}` : ""}`;
}
