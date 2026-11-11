import { registerChargeKind } from "../registry";

/**
 * A ₦100 charge for trying the payment flow end to end (simulated or on Paystack test keys).
 * It exists only outside production builds, so a live hotel can never be asked to pay it.
 */
if (process.env.NODE_ENV !== "production") {
  registerChargeKind({
    kind: "test_charge",
    quote: () => ({ amountKobo: 10_000, description: "Test payment to XYVOO", metadata: { test: true } }),
  });
}
