import type { PlatformChargeRow } from "./types";

/*
 * The hook point. Each thing a hotel can pay XYVOO for registers itself here (see ./kinds), saying
 * how to price it and what to do once it is paid, so the payments code never needs to change when
 * a new kind (the custom-domain purchase, later) is added.
 */

export type ChargeQuote = {
  /** Whole kobo, worked out on the server. Never taken from the browser. */
  amountKobo: number;
  description: string;
  /** What was bought, stored on the charge (e.g. the domain and extension). */
  metadata: Record<string, unknown>;
};

export type ChargeKindDefinition = {
  kind: string;
  /** Prices a request from the browser. Throw ChargeRequestError for input the hotel can fix. */
  quote: (ctx: { tenantId: string; input: Record<string, unknown> }) => Promise<ChargeQuote> | ChargeQuote;
  /**
   * Runs once the charge is paid (and again on retry if it threw). Must be safe to run more than once
   * for the same charge: use charge.id as the idempotency key. Throwing never loses the payment.
   */
  onPaid?: (charge: PlatformChargeRow) => Promise<void> | void;
};

/** Input the hotel can fix; its message is shown to them as is. */
export class ChargeRequestError extends Error {}

const kinds = new Map<string, ChargeKindDefinition>();

export function registerChargeKind(def: ChargeKindDefinition) {
  kinds.set(def.kind, def);
}

export function getChargeKind(kind: string): ChargeKindDefinition | undefined {
  return kinds.get(kind);
}

/** For tests only. */
export function clearChargeKinds() {
  kinds.clear();
}
