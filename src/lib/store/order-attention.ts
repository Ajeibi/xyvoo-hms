/*
 * Which orders are waiting on the shop, in plain terms: ready to send, or
 * waiting for the shop to check a bank transfer arrived. Built on the same
 * rules as the order actions, so the Home page, the Orders badge and the
 * Orders page always agree. No server code, so client screens can use it.
 */
import { availableOrderActions } from "./order-status";

type OrderState = { status: string; paymentStatus: string; paymentMethod: string };

/** Paid (or pay-on-delivery) and not yet sent. */
export function isReadyToSend(order: OrderState) {
  return availableOrderActions(order).includes("shipped");
}

/** An offline payment the shop needs to look for before sending. */
export function isAwaitingPaymentCheck(order: OrderState) {
  return !isReadyToSend(order) && availableOrderActions(order).includes("payment_received");
}

export function countOrdersNeedingAttention(orders: OrderState[]) {
  let toSend = 0;
  let toConfirm = 0;
  for (const order of orders) {
    if (isReadyToSend(order)) toSend += 1;
    else if (isAwaitingPaymentCheck(order)) toConfirm += 1;
  }
  return { toSend, toConfirm, total: toSend + toConfirm };
}
