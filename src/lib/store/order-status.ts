/*
 * What a shop can do with an order from the dashboard. Each action is only
 * offered when it makes sense for the order's current state. No server code
 * here, so the Orders page can use it too.
 */

export const ORDER_ACTIONS = ["payment_received", "shipped", "delivered", "cancel"] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];

export const ORDER_ACTION_LABELS: Record<OrderAction, string> = {
  payment_received: "Payment received",
  shipped: "Mark as shipped",
  delivered: "Mark as delivered",
  cancel: "Cancel order",
};

type OrderState = { status: string; paymentStatus: string; paymentMethod: string };

/** Payment methods where the money arrives at or after delivery (labels as stored on the order). */
const PAY_LATER_METHODS = new Set(["Pay on Delivery", "WhatsApp"]);

/** The actions available for an order, in the order they're shown. */
export function availableOrderActions(order: OrderState): OrderAction[] {
  if (order.status === "Cancelled") return [];
  // Fully refunded: the money is back with the customer, so nothing goes out.
  if (order.paymentStatus === "refunded") return order.status === "Delivered" ? [] : ["cancel"];
  const actions: OrderAction[] = [];
  // Card payments are confirmed by Paystack, not by hand.
  const paid = order.paymentStatus === "paid";
  if (!paid && order.paymentMethod !== "Card") actions.push("payment_received");
  // Ship once paid; pay on delivery and WhatsApp orders are paid on or after handover.
  const paysLater = PAY_LATER_METHODS.has(order.paymentMethod);
  if ((order.status === "Pending" || order.status === "Confirmed") && (paid || paysLater)) actions.push("shipped");
  // Delivered only follows shipped, so the order history reads in order.
  if (order.status === "Shipped") actions.push("delivered");
  if (order.status !== "Delivered") actions.push("cancel");
  return actions;
}
