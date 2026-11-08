/*
 * The payment provider contract. Nothing here names a provider. Flutterwave is one adapter in
 * ./adapters; Paystack or any other would be a sibling registered in ./registry.ts.
 *
 * NOTE: the HMS records payments and never takes them (the owner's rule, 2026-10-28), so nothing in
 * the guest bill, front desk or reservations calls this yet. It is built, tested and ready to be wired
 * in the day that rule changes. Amounts are in major units (naira, not kobo). Safe for the browser and server.
 */

export type PaymentProviderId = "flutterwave";

export type PaymentMode = "test" | "live" | "unknown";

export type CheckoutInput = {
  /** Our own unique reference for this payment, sent as the provider's transaction reference. */
  reference: string;
  amount: number;
  currency: string;
  email: string;
  name?: string;
  phone?: string;
  /** Where the provider sends the guest back after paying. */
  redirectUrl: string;
  /** Shown to the guest on the provider's page. */
  description: string;
  meta?: Record<string, string>;
};

export type Verification = {
  /** `successful` only when the provider says the money was taken. */
  status: "successful" | "failed" | "pending";
  amount: number | null;
  currency: string | null;
  providerTransactionId: string | null;
  reference: string | null;
};

export type WebhookEvent = {
  reference: string;
  providerTransactionId: string | null;
  event: string;
};

export type PaymentResult<T> = { ok: true; data: T } | { ok: false; error: string; retryable: boolean };

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Whether the key in use is a sandbox key. Live money must never be moved while testing. */
  readonly mode: PaymentMode;
  isConfigured(): boolean;
  createCheckout(input: CheckoutInput): Promise<PaymentResult<{ checkoutUrl: string }>>;
  verifyByReference(reference: string): Promise<PaymentResult<Verification>>;
  /** True when a webhook really came from the provider. Must be checked before the body is trusted. */
  verifyWebhook(headers: { get(name: string): string | null }, rawBody: string): boolean;
  parseWebhook(rawBody: string): WebhookEvent | null;
  refund(input: { providerTransactionId: string; amount: number }): Promise<PaymentResult<{ refundId: string | null }>>;
}

export type AttemptStatus = "pending" | "succeeded" | "failed" | "cancelled" | "refunded";

export type PaymentAttempt = {
  id: string;
  tenantId: string;
  provider: PaymentProviderId;
  reference: string;
  amount: number;
  currency: string;
  status: AttemptStatus;
  providerTransactionId: string | null;
};
