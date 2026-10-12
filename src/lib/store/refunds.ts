/*
 * Refund rules shared by the order page and the refund API. No server code.
 */
import { isSale } from "./sales";

type RefundableOrder = { status: string; paymentStatus: string; paymentMethod: string; totalAmount: number; refundedAmount: number };

/** Whether money was taken for the order, so there's something to give back. */
export function canRefund(order: RefundableOrder) {
  if (order.paymentStatus === "refunded") return false;
  return order.paymentStatus === "paid" || isSale(order.paymentStatus, order.status);
}

/** How much can still be refunded. */
export function refundableAmount(order: RefundableOrder) {
  if (!canRefund(order)) return 0;
  return Math.max(0, Math.round((order.totalAmount - order.refundedAmount) * 100) / 100);
}

/** Card payments go back through Paystack; anything else the shop returns itself and records here. */
export function refundMethod(order: Pick<RefundableOrder, "paymentMethod">): "paystack" | "manual" {
  return order.paymentMethod === "Card" ? "paystack" : "manual";
}

/** A plain reason the amount can't be refunded, or null if it can. */
export function refundAmountProblem(amount: number, refundable: number) {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter how much to refund.";
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return "Use no more than two decimal places.";
  if (amount > refundable + 1e-9) return "That's more than is left to refund on this order.";
  return null;
}

/**
 * The refund in Paystack's subunits, for the charge as it was made. When the
 * charge and the order total match (the usual case) this is just the amount;
 * otherwise it's the same share of what was charged.
 */
export function refundSubunits(amount: number, orderTotal: number, chargedAmount: number) {
  if (orderTotal <= 0) return 0;
  const charged = Math.round(chargedAmount * 100);
  if (Math.round(orderTotal * 100) === charged) return Math.round(amount * 100);
  return Math.min(charged, Math.round((amount / orderTotal) * charged));
}
