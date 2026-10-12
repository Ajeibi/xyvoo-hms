/*
 * Which alerts a shop wants, and how. Pure, so the dashboard card, the API
 * and tests share it. Stored in store.alert_settings.preferences; anything
 * missing falls back to the defaults (everything on).
 */

export const ALERT_KINDS = ["new_order", "low_stock", "payment_failed", "paid_cancelled"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
export type AlertChannels = { email: boolean; push: boolean };
export type AlertPrefs = Record<AlertKind, AlertChannels>;

export const ALERT_LABELS: Record<AlertKind, { title: string; description: string }> = {
  new_order: { title: "New orders", description: "Every new order, however the customer pays." },
  low_stock: { title: "Running low", description: "When an order takes a product down to its low-stock level." },
  payment_failed: { title: "Card payment didn't go through", description: "When a customer's card payment fails, so you can follow up." },
  paid_cancelled: { title: "Cancelled order was paid", description: "When a payment arrives for an order that was already cancelled." },
};

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  new_order: { email: true, push: true },
  low_stock: { email: true, push: true },
  payment_failed: { email: true, push: true },
  paid_cancelled: { email: true, push: true },
};

export function parseAlertPrefs(value: unknown): AlertPrefs {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const prefs = {} as AlertPrefs;
  for (const kind of ALERT_KINDS) {
    const entry = source[kind] && typeof source[kind] === "object" ? (source[kind] as Record<string, unknown>) : {};
    prefs[kind] = {
      email: typeof entry.email === "boolean" ? entry.email : DEFAULT_ALERT_PREFS[kind].email,
      push: typeof entry.push === "boolean" ? entry.push : DEFAULT_ALERT_PREFS[kind].push,
    };
  }
  return prefs;
}

/** Low stock: the products that an order has just taken to (or below) their warning level. */
export function productsAtLowStock(products: Array<{ id: string; stock: number | null; reorder_level: number | null }>) {
  return products.filter((p) => p.stock !== null && p.reorder_level !== null && Number(p.stock) <= Number(p.reorder_level));
}
