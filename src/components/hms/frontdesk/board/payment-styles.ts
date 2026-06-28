import type { PaymentDisplayStatus } from "@/lib/hms/front-desk-board";

/** Corner-dot colors — kept distinct from room-status legend (e.g. amber = reserved cell). */
/** High-contrast hues — each state far apart on the color wheel. */
export const PAYMENT_DOT_CLASS: Record<PaymentDisplayStatus, string> = {
  paid: "bg-emerald-600 ring-2 ring-white",
  partial: "bg-sky-500 ring-2 ring-white",
  unpaid: "bg-red-600 ring-2 ring-white",
  refund_pending: "bg-fuchsia-600 ring-2 ring-white",
  unknown: "bg-slate-500 ring-2 ring-white",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentDisplayStatus, string> = {
  paid: "Paid in full",
  partial: "Partially settled",
  unpaid: "Unpaid / not captured",
  refund_pending: "Refund pending",
  unknown: "Payment unknown",
};

export const PAYMENT_STATUS_HINT: Record<PaymentDisplayStatus, string> = {
  paid: "Folio matches or exceeds room charges.",
  partial: "Direct bill, split, or some payment posted — balance may remain.",
  unpaid: "Cash/card stay with nothing captured yet, or missing pre-auth.",
  refund_pending: "A refund is in progress on the folio.",
  unknown: "Not enough billing data to classify.",
};

export const PAYMENT_LEGEND_KEYS: PaymentDisplayStatus[] = [
  "paid",
  "partial",
  "unpaid",
  "refund_pending",
];
