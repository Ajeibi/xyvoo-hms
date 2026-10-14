/*
 * A pretend card gateway for testing the payment flow without Paystack or real
 * money. It is only ever on when PAYMENTS_SIMULATE=1 is set AND the app is not
 * a production build, so a deployed site (Vercel builds run with
 * NODE_ENV=production) can never use it, whatever the environment says.
 *
 * With it on, "Card" is offered at checkout for every shop, and paying sends
 * the shopper to a page where they choose what happens: paid, declined or left.
 */

export const simulatedPaymentsEnabled = () => process.env.PAYMENTS_SIMULATE === "1" && process.env.NODE_ENV !== "production";

export const SIMULATED_OUTCOMES = ["success", "failed", "abandoned"] as const;
export type SimulatedOutcome = (typeof SIMULATED_OUTCOMES)[number];

/** What an intent's metadata says about a simulated payment. */
export const isSimulatedIntent = (metadata: unknown) => Boolean(metadata && typeof metadata === "object" && (metadata as { simulated?: unknown }).simulated === true);
