import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatShopCurrency } from "@/lib/shop/format";
import { recordOrderEvent, type OrderActor } from "./order-events";
import { getPaystackKeyForReference } from "./payments";
import { isSimulatedIntent, simulatedPaymentsEnabled } from "@/lib/payments/simulated";
import { refundableAmount, refundAmountProblem, refundMethod, refundSubunits } from "./refunds";

/*
 * Refunds: card payments go back through Paystack's Refund API on the same
 * key that took the payment (XYVOO's for split payments, the shop's own
 * otherwise). Offline payments are recorded as returned by the shop. XYVOO's
 * fee on the order isn't refunded.
 */

export class RefundError extends Error {}

const PAYSTACK_REFUND_URL = "https://api.paystack.co/refund";

type PaystackRefund = { id?: number | string; status?: string };

async function createPaystackRefund(secretKey: string, input: { reference: string; amountSubunits: number; note: string | null }) {
  let res: Response;
  try {
    res = await fetch(PAYSTACK_REFUND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction: input.reference,
        amount: input.amountSubunits,
        ...(input.note ? { merchant_note: input.note.slice(0, 200) } : {}),
      }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[refund] Paystack could not be reached", { reference: input.reference, error });
    return null;
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    console.error("[refund] Paystack refused the refund", { reference: input.reference, status: res.status, message: json?.message });
    return null;
  }
  return (json.data ?? {}) as PaystackRefund;
}

export type RefundRequest = {
  tenantId: string;
  orderId: string;
  amount: number;
  reason: string | null;
  /** Items to put back in stock, with how many of each. */
  restock: { itemId: string; quantity: number }[];
  actor: OrderActor;
};

export async function issueRefund(input: RefundRequest) {
  const db = createServerSupabaseClient().schema("store");
  const { data: order, error } = await db
    .from("orders")
    .select("id, status, payment_status, payment_method, total_amount, refunded_amount, currency")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .maybeSingle();
  if (error?.code === "42703") throw new RefundError("Refunds aren't switched on for your shop yet. Please contact XYVOO support.");
  if (error) throw new Error(error.message);
  if (!order) throw new RefundError("Order not found.");

  const state = {
    status: order.status as string,
    paymentStatus: (order.payment_status as string) ?? "unpaid",
    paymentMethod: order.payment_method as string,
    totalAmount: Number(order.total_amount) || 0,
    refundedAmount: Number(order.refunded_amount) || 0,
  };
  const problem = refundAmountProblem(input.amount, refundableAmount(state));
  if (problem) throw new RefundError(refundableAmount(state) <= 0 ? "There's nothing left to refund on this order." : problem);

  const method = refundMethod(state);
  let paystack: { reference: string; secretKey: string; chargedAmount: number } | null = null;
  // A test payment (development only) has no Paystack transaction, so its refund is recorded as processed here.
  let simulatedRefund = false;
  if (method === "paystack") {
    const { data: intent } = await db
      .from("payment_intents")
      .select("paystack_reference, amount, metadata")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", input.orderId)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!intent) throw new RefundError("We couldn't find the card payment for this order. Please contact XYVOO support.");
    if (isSimulatedIntent(intent.metadata)) {
      if (!simulatedPaymentsEnabled()) throw new RefundError("This was a test payment, so it can't be refunded here.");
      simulatedRefund = true;
    }
    if (!simulatedRefund) {
      const key = await getPaystackKeyForReference(intent.paystack_reference as string);
      if (!key || key.tenantId !== input.tenantId) throw new RefundError("Card refunds aren't available for this order right now. Please contact XYVOO support.");
      paystack = { reference: intent.paystack_reference as string, secretKey: key.secretKey, chargedAmount: Number(intent.amount) || state.totalAmount };
    }
  }

  const amount = Math.round(input.amount * 100) / 100;
  const { data: begun, error: beginError } = await db.rpc("begin_order_refund", {
    p_tenant_id: input.tenantId,
    p_order_id: input.orderId,
    p_amount: amount,
    p_reason: input.reason ?? "",
    p_method: method,
    p_restock: input.restock.length > 0,
    p_actor_user_id: input.actor.userId,
    p_actor_name: input.actor.name,
  });
  if (beginError) {
    if (beginError.code === "PGRST202" || beginError.code === "42883") throw new RefundError("Refunds aren't switched on for your shop yet. Please contact XYVOO support.");
    throw new Error(beginError.message);
  }
  if (begun === "not_found") throw new RefundError("Order not found.");
  if (begun === "not_paid") throw new RefundError("This order hasn't been paid, so there's nothing to refund.");
  if (begun === "too_much") throw new RefundError("That's more than is left to refund on this order. Please refresh the page.");
  const refundId = String(begun);

  if (simulatedRefund) {
    await db.from("order_refunds").update({ status: "processed", paystack_status: "processed" }).eq("tenant_id", input.tenantId).eq("id", refundId);
  }

  if (paystack) {
    const result = await createPaystackRefund(paystack.secretKey, {
      reference: paystack.reference,
      amountSubunits: refundSubunits(amount, state.totalAmount, paystack.chargedAmount),
      note: input.reason,
    });
    if (!result) {
      await db.rpc("fail_order_refund", { p_tenant_id: input.tenantId, p_refund_id: refundId });
      throw new RefundError("Paystack couldn't make this refund just now. Nothing has been taken. Please try again later, or contact XYVOO support if it keeps happening.");
    }
    const { error: saveError } = await db
      .from("order_refunds")
      .update({ paystack_refund_id: result.id != null ? String(result.id) : null, paystack_status: result.status ?? null, status: result.status === "processed" ? "processed" : "processing" })
      .eq("tenant_id", input.tenantId)
      .eq("id", refundId);
    if (saveError) console.error("[refund] Paystack reference not saved", { refundId, error: saveError.message });
  }

  let restocked = 0;
  if (input.restock.length) {
    const { data: count, error: restockError } = await db.rpc("restock_order_items", {
      p_tenant_id: input.tenantId,
      p_order_id: input.orderId,
      p_items: input.restock.map((r) => ({ item_id: r.itemId, quantity: r.quantity })),
    });
    if (restockError) console.error("[refund] stock not returned", { refundId, error: restockError.message });
    else restocked = Number(count) || 0;
  }

  const money = formatShopCurrency(amount, (order.currency as string | null) || null);
  await recordOrderEvent(
    input.tenantId,
    input.orderId,
    {
      kind: "refund",
      message: `${method === "paystack" ? "Refunded" : "Refund recorded"}: ${money}${input.reason ? `. Reason: ${input.reason}` : ""}`,
      data: { refund_id: refundId, amount, method, restocked },
    },
    input.actor,
  );
  if (restocked > 0) {
    await recordOrderEvent(input.tenantId, input.orderId, { kind: "restocked", message: `${restocked} ${restocked === 1 ? "item" : "items"} put back in stock`, data: { refund_id: refundId } }, input.actor);
  }

  return { refundId, amount, method, restocked };
}

export type OrderRefund = { id: string; amount: number; method: "paystack" | "manual"; status: string; reason: string | null; actorName: string | null; createdAt: string };

export async function listOrderRefunds(tenantId: string, orderId: string): Promise<OrderRefund[]> {
  const { data, error } = await createServerSupabaseClient()
    .schema("store")
    .from("order_refunds")
    .select("id, amount, method, status, reason, actor_name, created_at")
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data || []).map((r) => ({
    id: r.id as string,
    amount: Number(r.amount) || 0,
    method: r.method as OrderRefund["method"],
    status: r.status as string,
    reason: (r.reason as string | null) ?? null,
    actorName: (r.actor_name as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export type PaystackRefundEvent = {
  event: string;
  transactionReference: string;
  status?: string | null;
  amountSubunits?: number | null;
  refundId?: string | null;
};

const REFUND_EVENT_MESSAGES: Record<string, string> = {
  "refund.processed": "Paystack has sent the refund. It can take up to 10 working days to reach the customer.",
  "refund.failed": "Paystack couldn't make the refund, so the money is back in your balance. You can try the refund again.",
  "refund.needs-attention": "Paystack needs the customer's bank details to finish this refund. Please contact XYVOO support.",
};

/**
 * Keeps a card refund up to date from Paystack's refund webhooks. The refund
 * is found through our own payment record for the transaction, never trusted
 * from the payload alone. A failed refund is undone, so it no longer counts.
 */
export async function applyPaystackRefundEvent(input: PaystackRefundEvent) {
  const db = createServerSupabaseClient().schema("store");
  const { data: intent } = await db
    .from("payment_intents")
    .select("tenant_id, order_id")
    .eq("paystack_reference", input.transactionReference)
    .limit(1)
    .maybeSingle();
  if (!intent) return;
  const tenantId = intent.tenant_id as string;
  const orderId = intent.order_id as string;

  const { data: open } = await db
    .from("order_refunds")
    .select("id, paystack_refund_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .eq("method", "paystack")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true });
  // Prefer the refund Paystack names; otherwise the oldest one still in progress.
  const refund = (open || []).find((r) => input.refundId && r.paystack_refund_id === input.refundId) ?? (open || [])[0];
  if (!refund) return;

  const status = input.event.replace(/^refund\./, "");
  if (status === "failed") {
    const { error } = await db.rpc("fail_order_refund", { p_tenant_id: tenantId, p_refund_id: refund.id });
    if (error) console.error("[refund webhook] could not undo failed refund", { refundId: refund.id, error: error.message });
  } else {
    await db
      .from("order_refunds")
      .update({ paystack_status: status, ...(status === "processed" ? { status: "processed" } : {}), ...(input.refundId ? { paystack_refund_id: input.refundId } : {}) })
      .eq("tenant_id", tenantId)
      .eq("id", refund.id);
  }

  const message = REFUND_EVENT_MESSAGES[input.event];
  if (message) await recordOrderEvent(tenantId, orderId, { kind: "refund", message, data: { refund_id: refund.id, paystack_status: status } });
}
