import { createServerSupabaseClient } from "@/lib/supabase/server";
import { addDays, addMonths, GRACE_DAYS } from "./billing";
import { logActivity, type ActivityActor } from "./activity";

/**
 * Standard plan state changes, driven by Paystack (the sign-up return page
 * and the webhook). Each is safe to apply more than once, because Paystack
 * may deliver the same event twice and the return page and webhook can race.
 */

const subscriptions = () => createServerSupabaseClient().schema("store").from("subscriptions");
const payments = () => createServerSupabaseClient().schema("store").from("subscription_payments");

/**
 * First Standard payment succeeded: the store moves to 0% straight away.
 * Whichever of the return page and the webhook gets here first records it in
 * the activity log (with the owner's name from the return page, or "Paystack").
 */
export async function activateStandard(input: { reference: string; customerCode: string | null; paidAt: Date; actor?: ActivityActor }) {
  const { data: payment } = await payments().select("tenant_id, status").eq("reference", input.reference).maybeSingle();
  if (!payment) return null;

  let firstToConfirm = false;
  if (payment.status !== "success") {
    const { data: flipped } = await payments()
      .update({ status: "success", paid_at: input.paidAt.toISOString() })
      .eq("reference", input.reference)
      .neq("status", "success")
      .select("reference");
    firstToConfirm = (flipped?.length ?? 0) > 0;
  }

  const { error } = await subscriptions()
    .update({
      plan: "standard",
      status: "active",
      platform_fee_rate: 0,
      current_period_end: addMonths(input.paidAt, 1).toISOString(),
      grace_ends_at: null,
      cancelled_at: null,
      ...(input.customerCode ? { paystack_customer_code: input.customerCode } : {}),
    })
    .eq("tenant_id", payment.tenant_id);
  if (error) throw new Error(error.message);
  if (firstToConfirm) {
    await logActivity({ tenantId: payment.tenant_id as string, actor: input.actor ?? { userId: null, name: "Paystack" }, area: "plan", action: "subscribed" });
  }
  return payment.tenant_id as string;
}

export async function markSubscriptionPaymentFailed(reference: string, status: "failed" | "abandoned") {
  await payments().update({ status }).eq("reference", reference).eq("status", "pending");
}

/** Paystack created the subscription: keep its code and email token (needed to cancel) and the real renewal date. */
export async function recordSubscriptionCreated(input: { customerCode: string; subscriptionCode: string; emailToken: string; nextPaymentDate: string | null }) {
  await subscriptions()
    .update({
      paystack_subscription_code: input.subscriptionCode,
      paystack_email_token: input.emailToken,
      ...(input.nextPaymentDate ? { current_period_end: input.nextPaymentDate } : {}),
    })
    .eq("paystack_customer_code", input.customerCode);
}

/** A monthly renewal was paid. */
export async function recordRenewal(input: { customerCode: string; paidAt: Date }) {
  await subscriptions()
    .update({ plan: "standard", status: "active", platform_fee_rate: 0, current_period_end: addMonths(input.paidAt, 1).toISOString(), grace_ends_at: null })
    .eq("paystack_customer_code", input.customerCode)
    .eq("plan", "standard");
}

/** A renewal payment failed: 0% continues for the grace period while the merchant updates their card. */
export async function recordPaymentFailed(subscriptionCode: string) {
  await subscriptions()
    .update({ status: "past_due", grace_ends_at: addDays(new Date(), GRACE_DAYS).toISOString() })
    .eq("paystack_subscription_code", subscriptionCode)
    .eq("status", "active");
}

/** The subscription won't renew: Standard lasts until the end of the paid period, then Free applies. */
export async function recordCancelled(subscriptionCode: string) {
  await subscriptions()
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("paystack_subscription_code", subscriptionCode)
    .neq("status", "cancelled");
}
