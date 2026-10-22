import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { creditTriggerEvents, latestEventTime, type OrderActor } from "./order-events";
import { availableOrderActions, ORDER_ACTIONS, type OrderAction } from "./order-status";

export { availableOrderActions, ORDER_ACTION_LABELS, ORDER_ACTIONS, type OrderAction } from "./order-status";

export const orderActionSchema = z.object({ slug: z.string(), action: z.enum(ORDER_ACTIONS) });

export class OrderActionError extends Error {}

/** Applies an action to one order. The timeline entry is written by a trigger and credited to `actor`. */
export async function applyOrderAction(tenantId: string, orderId: string, action: OrderAction, actor?: OrderActor) {
  const db = createServerSupabaseClient().schema("store");
  const { data: order, error } = await db
    .from("orders")
    .select("id, status, payment_status, payment_method")
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) throw new OrderActionError("Order not found.");

  const allowed = availableOrderActions({ status: order.status, paymentStatus: order.payment_status, paymentMethod: order.payment_method });
  if (!allowed.includes(action)) throw new OrderActionError("That can't be done to this order now. Please refresh the page.");

  const since = actor ? await latestEventTime(tenantId, orderId) : null;
  const now = new Date().toISOString();
  if (action === "cancel") {
    const { data, error: cancelError } = await db.rpc("cancel_order", { p_tenant_id: tenantId, p_order_id: orderId });
    if (cancelError) throw new Error(cancelError.message);
    // cancel_order locks the order and checks it again, so a change made meanwhile is caught there.
    if (data === "delivered") throw new OrderActionError("Delivered orders can't be cancelled.");
    if (data === "already_cancelled") throw new OrderActionError("This order has already been cancelled. Please refresh the page.");
    if (data === "not_found") throw new OrderActionError("Order not found.");
  } else {
    const update: Record<string, unknown> =
      action === "payment_received"
        ? { payment_status: "paid", paid_at: now, expires_at: null, ...(order.status === "Pending" ? { status: "Confirmed" } : {}) }
        : action === "shipped"
          ? { status: "Shipped", expires_at: null }
          : { status: "Delivered", expires_at: null };
    // Only if the order is still as it was checked above: two people acting on it at once (or a payment
    // arriving) can't both win, e.g. one marking it shipped while the other cancels it.
    const { data: changed, error: updateError } = await db
      .from("orders")
      .update({ ...update, updated_at: now })
      .eq("tenant_id", tenantId)
      .eq("id", orderId)
      .eq("status", order.status)
      .eq("payment_status", order.payment_status)
      .select("id");
    if (updateError) throw new Error(updateError.message);
    if (!changed?.length) throw new OrderActionError("Someone else has just changed this order. Please refresh the page to see it.");
  }

  if (actor) await creditTriggerEvents(tenantId, orderId, since, actor);
}
