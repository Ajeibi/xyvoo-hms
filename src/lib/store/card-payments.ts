import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toSubunitAmount } from "@/lib/shop/checkout";
import { sendOrderPaidEmails, sendPaidCancelledAlert } from "./order-emails";

/*
 * The one path that turns a successful Paystack charge into a paid order. The
 * return page and the webhook both call it, often within seconds of each
 * other, so every step is safe to run twice: the order is marked paid once,
 * the paid emails go once, and the paid-but-cancelled alert goes once.
 */

export type CardPaymentResult = "paid" | "mismatch" | "unknown";

export async function finalizeCardPayment(input: { reference: string; amountSubunit?: number; currency?: string | null }): Promise<CardPaymentResult> {
  const db = createServerSupabaseClient().schema("store");
  const { data: intent } = await db
    .from("payment_intents")
    .select("order_id, tenant_id, amount, currency_code")
    .eq("paystack_reference", input.reference)
    .maybeSingle();
  if (!intent) return "unknown";

  // Defence in depth, even with a valid signature: what Paystack charged must be what we asked for.
  const amountOk = typeof input.amountSubunit !== "number" || input.amountSubunit === toSubunitAmount(Number(intent.amount));
  const currencyOk = !input.currency || input.currency.toUpperCase() === String(intent.currency_code || "NGN").toUpperCase();
  if (!amountOk || !currencyOk) {
    console.error("[card payment] charge does not match the order", {
      reference: input.reference,
      expected: { amount: intent.amount, currency: intent.currency_code },
      received: { amountSubunit: input.amountSubunit, currency: input.currency },
    });
    await db
      .from("payment_intents")
      .update({ status: "failed", metadata: { mismatch: { amountSubunit: input.amountSubunit ?? null, currency: input.currency ?? null } }, updated_at: new Date().toISOString() })
      .eq("paystack_reference", input.reference);
    return "mismatch";
  }

  const { error } = await db.rpc("mark_order_paid", { p_order_id: intent.order_id, p_paystack_reference: input.reference });
  if (error) throw new Error(error.message);

  const now = new Date().toISOString();
  // Claim the emails: only the caller whose update changes the row sends them.
  const { data: claimed } = await db
    .from("orders")
    .update({ emails_sent_at: now })
    .eq("id", intent.order_id)
    .is("emails_sent_at", null)
    .select("id, status")
    .maybeSingle();
  if (claimed) await sendOrderPaidEmails(intent.tenant_id as string, intent.order_id as string);

  // Paid after its stock was released: tell the shop, once.
  const { data: alert } = await db
    .from("orders")
    .update({ paid_cancelled_alerted_at: now })
    .eq("id", intent.order_id)
    .eq("status", "Cancelled")
    .eq("payment_status", "paid")
    .is("paid_cancelled_alerted_at", null)
    .select("id")
    .maybeSingle();
  if (alert) await sendPaidCancelledAlert(intent.tenant_id as string, intent.order_id as string);

  return "paid";
}
