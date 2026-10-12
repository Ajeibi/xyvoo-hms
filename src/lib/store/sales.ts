/**
 * Whether an order counts as a sale: paid online, or moved by the shop to
 * Confirmed, Shipped or Delivered (bank transfer and cash on delivery never
 * go through Paystack, so they stay "unpaid"). Cancelled orders, failed
 * online payments and fully refunded orders never count. Matches
 * store.is_sale() in the database.
 */
export function isSale(paymentStatus: string | null | undefined, status: string | null | undefined) {
  if (paymentStatus === "paid") return true;
  return (status === "Confirmed" || status === "Shipped" || status === "Delivered") && paymentStatus !== "failed" && paymentStatus !== "refunded";
}

/** The money an order brought in: its total less anything refunded, or nothing if it isn't a sale. */
export function saleAmount(order: { paymentStatus: string; status: string; totalAmount: number; refundedAmount?: number }) {
  if (!isSale(order.paymentStatus, order.status)) return 0;
  return Math.max(0, order.totalAmount - (order.refundedAmount ?? 0));
}
