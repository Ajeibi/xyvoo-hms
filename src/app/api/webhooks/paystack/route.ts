import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTenantIdByPaystackReference, getTenantPaystackSetup } from "@/lib/shop/tenants";
import { toSubunitAmount } from "@/lib/shop/checkout";
import { isValidWebhookSignature } from "@/lib/shop/paystack";
import { getPlatformPaystack } from "@/lib/payments/platform-paystack";
import {
  activateStandard,
  markSubscriptionPaymentFailed,
  recordCancelled,
  recordPaymentFailed,
  recordRenewal,
  recordSubscriptionCreated,
} from "@/lib/store/subscriptions";

type PaystackEvent = {
  event?: string;
  data?: {
    reference?: string;
    status?: string;
    amount?: number;
    paid_at?: string;
    metadata?: { purpose?: string } | string | null;
    plan?: { plan_code?: string } | Record<string, never> | null;
    customer?: { customer_code?: string };
    subscription_code?: string;
    email_token?: string;
    next_payment_date?: string | null;
    subscription?: { subscription_code?: string };
  };
};

/**
 * One URL for every Paystack event about store payments.
 *
 * Events signed with XYVOO's platform key are split-payment store orders and
 * Standard plan billing. Anything else may come from an older store that uses
 * its own Paystack keys: the tenant is looked up from OUR OWN payment record
 * before its key is used to check the signature, never from the payload.
 *
 * The return pages are the main path; this is the backup for shoppers who
 * close the tab before Paystack redirects them. Every handler is idempotent.
 */
export async function POST(req: Request) {
  // HMAC the raw body: a re-stringified object won't match Paystack's signature.
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  let payload: PaystackEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const platform = getPlatformPaystack();
  if (platform && isValidWebhookSignature(rawBody, signature, platform.secretKey)) {
    await handlePlatformEvent(payload);
    return NextResponse.json({ received: true });
  }

  return handleOwnKeysEvent(payload, rawBody, signature);
}

async function markStoreOrderPaid(reference: string, amount: number | undefined) {
  const service = createServerSupabaseClient();
  const { data: intent } = await service.schema("store").from("payment_intents").select("order_id, amount").eq("paystack_reference", reference).maybeSingle();
  if (!intent) return false;
  // Defence in depth: the amount must match even with a valid signature.
  if (typeof amount === "number" && amount !== toSubunitAmount(Number(intent.amount))) return true;
  await service.schema("store").rpc("mark_order_paid", { p_order_id: intent.order_id, p_paystack_reference: reference });
  return true;
}

function isSubscriptionCharge(data: NonNullable<PaystackEvent["data"]>) {
  const meta = typeof data.metadata === "object" && data.metadata ? data.metadata : null;
  return meta?.purpose === "store_subscription";
}

async function handlePlatformEvent(payload: PaystackEvent) {
  const data = payload.data;
  if (!data) return;

  switch (payload.event) {
    case "charge.success": {
      if (data.status !== "success" || !data.reference) return;
      const paidAt = data.paid_at ? new Date(data.paid_at) : new Date();
      const customerCode = data.customer?.customer_code ?? null;

      // First Standard payment, started from the dashboard.
      if (isSubscriptionCharge(data)) {
        await activateStandard({ reference: data.reference, customerCode, paidAt });
        return;
      }
      // A split-payment store order.
      if (await markStoreOrderPaid(data.reference, data.amount)) return;
      // Otherwise a monthly renewal of the Standard plan (Paystack's own reference).
      if (customerCode && data.plan && "plan_code" in data.plan && data.plan.plan_code) {
        await recordRenewal({ customerCode, paidAt });
      }
      return;
    }
    case "charge.failed":
      if (data.reference && isSubscriptionCharge(data)) await markSubscriptionPaymentFailed(data.reference, "failed");
      return;
    case "subscription.create":
      if (data.customer?.customer_code && data.subscription_code && data.email_token) {
        await recordSubscriptionCreated({
          customerCode: data.customer.customer_code,
          subscriptionCode: data.subscription_code,
          emailToken: data.email_token,
          nextPaymentDate: data.next_payment_date ?? null,
        });
      }
      return;
    case "invoice.payment_failed":
      if (data.subscription?.subscription_code) await recordPaymentFailed(data.subscription.subscription_code);
      return;
    case "subscription.not_renew":
    case "subscription.disable":
      if (data.subscription_code) await recordCancelled(data.subscription_code);
      return;
  }
}

async function handleOwnKeysEvent(payload: PaystackEvent, rawBody: string, signature: string | null) {
  const reference = payload.data?.reference;
  if (!reference) return NextResponse.json({ received: true });

  const tenantId = await getTenantIdByPaystackReference(reference);
  // Unknown reference: acknowledge quietly rather than reveal which references exist.
  if (!tenantId) return NextResponse.json({ received: true });

  const paystack = await getTenantPaystackSetup(tenantId);
  if (!paystack?.webhookSecret) return NextResponse.json({ received: true });
  if (!isValidWebhookSignature(rawBody, signature, paystack.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  if (payload.event === "charge.success" && payload.data?.status === "success") {
    await markStoreOrderPaid(reference, payload.data.amount);
  }
  return NextResponse.json({ received: true });
}
