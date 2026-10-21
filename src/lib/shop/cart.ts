import type { FixedPrices } from "@/lib/store/currencies";

export type CartLine = {
  productId: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  imageUrl: string | null;
  /** In the shop's home currency, which is what the shopper is charged in. */
  unitPrice: number;
  currency: string;
  /** The merchant's own unit price in other currencies, shown instead of converting. */
  fixedPrices?: Record<string, number>;
  /** The product's extra delivery charge per item, for showing the delivery total; checkout works it out again. */
  deliveryExtra?: number;
  quantity: number;
  /** Snapshot at add-to-cart time, purely for UI hints (e.g. disabling "+" past
   * stock) -- the checkout API always re-validates against live stock. */
  maxQuantity: number;
  /** The product's minimum order quantity, so the basket can't go below it (checkout would refuse). */
  minQuantity?: number;
  /** Set when the shop says this line can't be bought as it is: taken off sale, or sold out. Checkout waits until it's removed. */
  problem?: "unavailable" | "sold-out";
};

/** Today's stock and availability for a basket line, from the shop (see /api/shop/[slug]/basket). */
export type LineAvailability = {
  productId: string;
  variantId: string | null;
  maxQuantity: number;
  minQuantity: number;
  problem: CartLine["problem"] | null;
};

/** Just the unit prices, which is all a basket line needs. */
export function fixedLinePrices(prices: FixedPrices | undefined): Record<string, number> | undefined {
  if (!prices) return undefined;
  const entries = Object.entries(prices).map(([code, p]) => [code, p.price] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function cartLineKey(productId: string, variantId: string | null): string {
  return `${productId}:${variantId || ""}`;
}

export function calculateCartTotals(lines: CartLine[]): { subtotal: number; itemCount: number; currency: string | null } {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const currencies = new Set(lines.map((l) => l.currency));
  const currency = currencies.size === 1 ? lines[0]?.currency ?? null : null;

  return { subtotal, itemCount, currency };
}
