import { initializeTransaction, verifyTransaction } from "@/lib/shop/paystack";
import { getPlatformPaystack } from "@/lib/payments/platform-paystack";
import { simulatedPaymentsEnabled, type SimulatedOutcome } from "@/lib/payments/simulated";
import type { PlatformChargeRow } from "./types";

/*
 * How a platform charge talks to a payment gateway. The real one is XYVOO's own Paystack account
 * (PAYSTACK_PLATFORM_SECRET_KEY), through the same fetch wrappers the storefront uses
 * (lib/shop/paystack) -- but WITHOUT a split or subaccount: this money is XYVOO's, not a store's.
 * The simulated one stands in when PAYMENTS_SIMULATE=1 in development (see lib/payments/simulated).
 */

export type GatewayInit = {
  email: string;
  amountKobo: number;
  currency: string;
  reference: string;
  /** Where Paystack sends the payer back to. */
  callbackUrl: string;
  /** Where the pretend gateway lives (simulated mode only). */
  simulateUrl: string;
  metadata: Record<string, unknown>;
};

export type GatewayVerification = {
  status: "success" | "failed" | "abandoned" | "pending";
  amountKobo: number;
  currency: string;
  reference: string;
};

export type Gateway = {
  simulated: boolean;
  initialize(input: GatewayInit): Promise<{ authorizationUrl: string; accessCode: string | null }>;
  verify(charge: PlatformChargeRow): Promise<GatewayVerification>;
};

export class GatewayNotConfiguredError extends Error {
  constructor() {
    super("Online payments to XYVOO aren't switched on yet.");
  }
}

export const realGateway: Gateway = {
  simulated: false,
  async initialize(input) {
    const platform = getPlatformPaystack();
    if (!platform) throw new GatewayNotConfiguredError();
    const r = await initializeTransaction({
      secretKey: platform.secretKey,
      email: input.email,
      amountSubunit: input.amountKobo,
      reference: input.reference,
      currency: input.currency,
      callbackUrl: input.callbackUrl,
      metadata: input.metadata,
    });
    return { authorizationUrl: r.authorizationUrl, accessCode: r.accessCode };
  },
  async verify(charge) {
    const platform = getPlatformPaystack();
    if (!platform) throw new GatewayNotConfiguredError();
    const r = await verifyTransaction({ secretKey: platform.secretKey, reference: charge.reference });
    return { status: r.status, amountKobo: Number(r.amountSubunit), currency: String(r.currency || ""), reference: r.reference };
  },
};

export const simulatedGateway: Gateway = {
  simulated: true,
  async initialize(input) {
    return { authorizationUrl: `${input.simulateUrl}?reference=${encodeURIComponent(input.reference)}`, accessCode: null };
  },
  async verify(charge) {
    const outcome = charge.metadata.simulated_outcome as SimulatedOutcome | undefined;
    // Until the payer has chosen, nothing has happened: the same answer Paystack gives for an unpaid reference.
    const status = outcome === "success" ? "success" : outcome === "failed" ? "failed" : outcome === "abandoned" ? "abandoned" : "pending";
    return { status, amountKobo: charge.amountKobo, currency: charge.currency, reference: charge.reference };
  },
};

/** The gateway a new charge goes through. */
export function gatewayForNewCharge(): Gateway {
  return simulatedPaymentsEnabled() ? simulatedGateway : realGateway;
}

/** The gateway an existing charge was made with. A simulated charge is only honoured where simulating is on. */
export function gatewayForCharge(charge: PlatformChargeRow): Gateway {
  return charge.metadata.simulated === true && simulatedPaymentsEnabled() ? simulatedGateway : realGateway;
}
