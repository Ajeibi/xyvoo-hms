import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTenantPaystackSetup } from "@/lib/shop/tenants";
import { getPlatformPaystack } from "@/lib/payments/platform-paystack";
import { effectiveFeeRate, type SubscriptionState } from "./billing";

/**
 * How a store takes payment.
 *
 *   split     The store has a payout account (a Paystack subaccount): payments run on
 *             XYVOO's Paystack account and XYVOO's fee is split off at settlement.
 *   own-keys  Older stores that entered their own Paystack keys before split payments
 *             existed. Payments go straight to the store; no fee is collected.
 */
export type PaymentRoute =
  | { kind: "split"; secretKey: string; subaccountCode: string; bearer: "subaccount" | "account"; feeRate: number }
  | { kind: "own-keys"; secretKey: string; webhookSecret: string };

export async function getStoreSubscription(tenantId: string): Promise<SubscriptionState | null> {
  const { data } = await createServerSupabaseClient()
    .schema("store")
    .from("subscriptions")
    .select("plan, status, platform_fee_rate, current_period_end, grace_ends_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as SubscriptionState | null) ?? null;
}

export async function getActivePayoutAccount(tenantId: string) {
  const { data } = await createServerSupabaseClient()
    .schema("store")
    .from("payout_accounts")
    .select("subaccount_code, business_name, bank_code, bank_name, account_name, account_number_last4, verified_at")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

export async function getStorePaymentRoute(tenantId: string): Promise<PaymentRoute | null> {
  const platform = getPlatformPaystack();
  if (platform) {
    const payout = await getActivePayoutAccount(tenantId);
    if (payout) {
      return {
        kind: "split",
        secretKey: platform.secretKey,
        subaccountCode: payout.subaccount_code,
        bearer: platform.splitBearer,
        feeRate: effectiveFeeRate(await getStoreSubscription(tenantId)),
      };
    }
  }
  const own = await getTenantPaystackSetup(tenantId);
  return own ? { kind: "own-keys", secretKey: own.secretKey, webhookSecret: own.webhookSecret } : null;
}

/**
 * The secret key that can verify a store payment, worked out from OUR OWN
 * payment_intents record: split payments were made on XYVOO's account,
 * everything else on the store's own keys.
 */
export async function getPaystackKeyForReference(reference: string): Promise<{ tenantId: string; secretKey: string; split: boolean } | null> {
  const { data: intent } = await createServerSupabaseClient()
    .schema("store")
    .from("payment_intents")
    .select("tenant_id, subaccount_code")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (!intent) return null;

  if (intent.subaccount_code) {
    const platform = getPlatformPaystack();
    return platform ? { tenantId: intent.tenant_id, secretKey: platform.secretKey, split: true } : null;
  }
  const own = await getTenantPaystackSetup(intent.tenant_id);
  return own ? { tenantId: intent.tenant_id, secretKey: own.secretKey, split: false } : null;
}
