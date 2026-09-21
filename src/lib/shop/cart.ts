export type CartLine = {
  productId: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  imageUrl: string | null;
  unitPrice: number;
  currency: string;
  quantity: number;
  /** Snapshot at add-to-cart time, purely for UI hints (e.g. disabling "+" past
   * stock) -- the checkout API always re-validates against live stock. */
  maxQuantity: number;
};

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
