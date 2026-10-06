/**
 * Whether an order counts as a sale: paid online, or moved by the shop to
 * Confirmed, Shipped or Delivered (bank transfer and cash on delivery never
 * go through Paystack, so they stay "unpaid"). Cancelled orders and failed
 * online payments never count. Matches store.is_sale() in the database.
 */
export function isSale(paymentStatus: string | null | undefined, status: string | null | undefined) {
  if (paymentStatus === "paid") return true;
  return (status === "Confirmed" || status === "Shipped" || status === "Delivered") && paymentStatus !== "failed";
}
