import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logIntegrationEvent } from "../connections";
import { createFlutterwaveProvider } from "./adapters/flutterwave";
import type { AttemptStatus, CheckoutInput, PaymentAttempt, PaymentProvider, PaymentProviderId, PaymentResult, Verification } from "./types";

/*
 * The one place that decides which payment provider is used, plus the bookkeeping around each payment
 * attempt (hotel.payment_attempts). Nothing here posts to a guest bill: the HMS records payments and
 * never takes them, so this is built and tested but not wired in. To switch provider: write a new
 * adapter next to flutterwave.ts and return it from getPaymentProvider.
 */

let override: PaymentProvider | null = null;
/** Tests put a fake provider here. */
export function setPaymentProviderForTests(p: PaymentProvider | null) {
  override = p;
}

export function activePaymentProviderId(): PaymentProviderId {
  return "flutterwave";
}

export function getPaymentProvider(id: PaymentProviderId = activePaymentProviderId()): PaymentProvider {
  if (override) return override;
  switch (id) {
    case "flutterwave":
      return createFlutterwaveProvider();
  }
}

/** A reference that is unique, hard to guess, and recognisable in the provider's dashboard. */
export function newPaymentReference(prefix = "XYV"): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

/** Live money must not move on a developer machine or preview by accident. */
export function liveKeyGuard(provider: PaymentProvider, nodeEnv = process.env.NODE_ENV, allowLive = process.env.PAYMENTS_ALLOW_LIVE === "1"): string | null {
  if (provider.mode === "live" && nodeEnv !== "production" && !allowLive) {
    return "A live payment key is set on a server that is not production. Use the provider's test key here.";
  }
  return null;
}

/**
 * What a provider's answer means for an attempt. Money counts only when the provider says it was taken,
 * in the currency we asked for, and for at least the amount we asked for. An attempt that has already
 * succeeded or been refunded never changes again, so a repeated webhook is harmless.
 */
export function reconcileAttempt(
  attempt: Pick<PaymentAttempt, "status" | "amount" | "currency">,
  v: Verification,
): { status: AttemptStatus; note: string | null } {
  if (attempt.status === "succeeded" || attempt.status === "refunded") return { status: attempt.status, note: null };
  if (v.status === "pending") return { status: attempt.status, note: null };
  if (v.status === "failed") return { status: "failed", note: "The provider says the payment failed." };
  if ((v.currency ?? "").toUpperCase() !== attempt.currency.toUpperCase()) {
    return { status: "failed", note: `Paid in ${v.currency ?? "an unknown currency"}, not ${attempt.currency}. Needs a person to look at it.` };
  }
  if (v.amount === null || v.amount + 0.001 < attempt.amount) {
    return { status: "failed", note: `Paid ${v.amount ?? "an unknown amount"}, less than the ${attempt.amount} asked for. Needs a person to look at it.` };
  }
  return { status: "succeeded", note: null };
}

type AttemptRow = {
  id: string;
  tenant_id: string;
  provider: PaymentProviderId;
  reference: string;
  amount: number | string;
  currency: string;
  status: AttemptStatus;
  provider_transaction_id: string | null;
};

const toAttempt = (r: AttemptRow): PaymentAttempt => ({
  id: r.id,
  tenantId: r.tenant_id,
  provider: r.provider,
  reference: r.reference,
  amount: Number(r.amount),
  currency: r.currency,
  status: r.status,
  providerTransactionId: r.provider_transaction_id,
});

export async function createPaymentAttempt(
  db: SupabaseClient,
  input: Omit<CheckoutInput, "reference"> & { tenantId: string; purpose?: string; reservationId?: string | null; createdBy?: string | null },
  provider: PaymentProvider = getPaymentProvider(),
): Promise<PaymentResult<{ attempt: PaymentAttempt; checkoutUrl: string }>> {
  const blocked = liveKeyGuard(provider);
  if (blocked) return { ok: false, error: blocked, retryable: false };
  if (!provider.isConfigured()) return { ok: false, error: "The payment provider is not set up on this server.", retryable: false };

  const reference = newPaymentReference();
  const startedAt = Date.now();
  const checkout = await provider.createCheckout({ ...input, reference });
  await logIntegrationEvent(db, { tenantId: input.tenantId, kind: "payment", provider: provider.id, action: "create_checkout", ok: checkout.ok, error: checkout.ok ? null : checkout.error, startedAt, ref: reference });
  if (!checkout.ok) return checkout;

  const { data, error } = await db
    .schema("hotel")
    .from("payment_attempts")
    .insert({
      tenant_id: input.tenantId,
      provider: provider.id,
      reference,
      amount: input.amount,
      currency: input.currency,
      purpose: input.purpose ?? null,
      reservation_id: input.reservationId ?? null,
      customer_email: input.email,
      checkout_url: checkout.data.checkoutUrl,
      created_by: input.createdBy ?? null,
    })
    .select("id,tenant_id,provider,reference,amount,currency,status,provider_transaction_id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.code === "42P01" ? "Payments are not set up yet. Apply the integrations_payments migration." : "Could not record the payment attempt.", retryable: false };
  }
  return { ok: true, data: { attempt: toAttempt(data as AttemptRow), checkoutUrl: checkout.data.checkoutUrl } };
}

/** Asks the provider what happened to a reference and records it. Safe to call as often as you like. */
export async function refreshPaymentAttempt(
  db: SupabaseClient,
  reference: string,
  provider: PaymentProvider = getPaymentProvider(),
): Promise<PaymentResult<{ attempt: PaymentAttempt; changed: boolean; note: string | null }>> {
  const { data } = await db
    .schema("hotel")
    .from("payment_attempts")
    .select("id,tenant_id,provider,reference,amount,currency,status,provider_transaction_id")
    .eq("provider", provider.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!data) return { ok: false, error: "No payment attempt with that reference.", retryable: false };
  const attempt = toAttempt(data as AttemptRow);
  if (attempt.status === "succeeded" || attempt.status === "refunded") return { ok: true, data: { attempt, changed: false, note: null } };

  const startedAt = Date.now();
  const v = await provider.verifyByReference(reference);
  await logIntegrationEvent(db, { tenantId: attempt.tenantId, kind: "payment", provider: provider.id, action: "verify", ok: v.ok, error: v.ok ? null : v.error, startedAt, ref: reference });
  if (!v.ok) return v;

  const next = reconcileAttempt(attempt, v.data);
  const providerTransactionId = v.data.providerTransactionId ?? attempt.providerTransactionId;
  const changed = next.status !== attempt.status;
  if (changed || providerTransactionId !== attempt.providerTransactionId) {
    await db
      .schema("hotel")
      .from("payment_attempts")
      .update({ status: next.status, provider_transaction_id: providerTransactionId, raw: { verification: v.data, note: next.note }, updated_at: new Date().toISOString() })
      .eq("id", attempt.id)
      // Only move forward from the state we read, so two workers cannot undo each other.
      .eq("status", attempt.status);
  }
  return { ok: true, data: { attempt: { ...attempt, status: next.status, providerTransactionId }, changed, note: next.note } };
}

export type WebhookOutcome = { kind: "bad_signature" } | { kind: "ignored" } | { kind: "processed"; reference: string; status: AttemptStatus; changed: boolean } | { kind: "retry"; error: string };

/**
 * A provider's notification. The signature is checked first, and then the result is never taken from the
 * body: the provider is asked directly, so a forged or replayed body cannot mark anything paid.
 */
export async function handlePaymentWebhook(
  db: SupabaseClient,
  headers: { get(name: string): string | null },
  rawBody: string,
  provider: PaymentProvider = getPaymentProvider(),
): Promise<WebhookOutcome> {
  if (!provider.verifyWebhook(headers, rawBody)) return { kind: "bad_signature" };
  const event = provider.parseWebhook(rawBody);
  if (!event) return { kind: "ignored" };
  const r = await refreshPaymentAttempt(db, event.reference, provider);
  if (!r.ok) {
    // An unknown reference is not ours (or not yet written): acknowledge so the provider stops resending.
    return r.retryable ? { kind: "retry", error: r.error } : { kind: "ignored" };
  }
  return { kind: "processed", reference: event.reference, status: r.data.attempt.status, changed: r.data.changed };
}
