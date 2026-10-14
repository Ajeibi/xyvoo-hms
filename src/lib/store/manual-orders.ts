/*
 * Orders recorded by hand from the dashboard (see /api/store/orders/manual and
 * store.create_manual_order). No server code here, so the Orders page can use it.
 */

export const MANUAL_CHANNELS = ["in_person", "phone", "whatsapp", "social", "other"] as const;
export type ManualChannel = (typeof MANUAL_CHANNELS)[number];

export const CHANNEL_LABELS: Record<ManualChannel | "online", string> = {
  online: "Online shop",
  in_person: "In person",
  phone: "Phone",
  whatsapp: "WhatsApp",
  social: "Social media",
  other: "Other",
};

export const MANUAL_PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card (POS)", "Pay later"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<ManualPaymentMethod, string> = {
  Cash: "Cash",
  "Bank Transfer": "Bank transfer",
  "Card (POS)": "Card on a POS machine",
  "Pay later": "Not paid yet",
};

/** What a hand-recorded order comes to: items, less the discount (never below zero), plus delivery. */
export function manualOrderTotal(lines: { unitPrice: number; quantity: number }[], discount: number, deliveryFee: number) {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const off = Math.min(Math.max(discount, 0), subtotal);
  return { subtotal, discount: off, total: Math.round((subtotal - off + Math.max(deliveryFee, 0)) * 100) / 100 };
}
