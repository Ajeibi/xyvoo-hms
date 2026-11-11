import { randomBytes } from "node:crypto";
import { after } from "next/server";
import "./kinds";
import { gatewayForCharge, gatewayForNewCharge, type Gateway } from "./gateway";
import { getChargeKind } from "./registry";
import { supabaseChargeStore, type ChargeStore } from "./store";
import { CHARGE_EXPIRY_MS, CHARGE_PURPOSE, CHARGE_REFERENCE_PREFIX, type PlatformChargeRow } from "./types";

export type ChargeDeps = {
  store: ChargeStore;
  /** Which gateway an existing charge goes through. */
  gatewayFor: (charge: PlatformChargeRow) => Gateway;
  sendReceipt: (charge: PlatformChargeRow) => Promise<void>;
  now: () => Date;
};

export function defaultChargeDeps(): ChargeDeps {
  return {
    store: supabaseChargeStore(),
    gatewayFor: gatewayForCharge,
    // Sent after the response, so a slow mail server never keeps the payer waiting on the return page.
    sendReceipt: async (charge) => {
      const store = supabaseChargeStore();
      after(async () => {
        try {
          // Loaded on demand: the mailer reads its settings when imported.
          const { sendChargeReceipt } = await import("./receipt");
          await sendChargeReceipt(charge);
          await store.markReceiptSent(charge.id, new Date());
        } catch (error) {
          console.error("[platform charge] receipt email failed", { chargeId: charge.id, message: error instanceof Error ? error.message : String(error) });
        }
      });
    },
    now: () => new Date(),
  };
}

// ---- Start a charge -------------------------------------------------------------------------

export type CreateChargeInput = {
  tenantId: string;
  kind: string;
  /** Already priced by the kind's `quote` on the server. */
  amountKobo: number;
  description: string;
  metadata: Record<string, unknown>;
  payerEmail: string;
  createdBy: string | null;
  /** The app's own origin, e.g. https://getxyvoo.com, and the hotel's slug, to build the return links. */
  origin: string;
  slug: string;
};

export type CreatedCharge = { charge: PlatformChargeRow; authorizationUrl: string; reference: string };

/**
 * Records the charge, then asks Paystack (XYVOO's own account) for a payment page. The row is made
 * first so the amount we later check against is the one we set, never anything the browser sends.
 * If Paystack refuses, the row is left as a failed attempt so nothing dangles as "pending".
 */
export async function createCharge(
  input: CreateChargeInput,
  deps: { store: ChargeStore; gateway: Gateway } = { store: supabaseChargeStore(), gateway: gatewayForNewCharge() },
): Promise<CreatedCharge> {
  if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo <= 0) throw new Error("A charge needs a whole amount in kobo.");
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(input.kind)) throw new Error("Unknown kind of charge.");
  if (!input.payerEmail) throw new Error("A charge needs the payer's email.");

  const reference = `${CHARGE_REFERENCE_PREFIX}${randomBytes(9).toString("hex")}`;
  const metadata = deps.gateway.simulated ? { ...input.metadata, simulated: true } : input.metadata;
  const charge = await deps.store.insert({
    tenantId: input.tenantId,
    kind: input.kind,
    description: input.description,
    amountKobo: input.amountKobo,
    currency: "NGN",
    reference,
    payerEmail: input.payerEmail,
    metadata,
    createdBy: input.createdBy,
  });

  const base = `${input.origin.replace(/\/$/, "")}/hms/${encodeURIComponent(input.slug)}/billing`;
  try {
    const init = await deps.gateway.initialize({
      email: input.payerEmail,
      amountKobo: charge.amountKobo,
      currency: charge.currency,
      reference,
      callbackUrl: `${base}/return`,
      simulateUrl: `${base}/simulate`,
      // Only ids and the kind: nothing the payer typed and nothing secret.
      metadata: { purpose: CHARGE_PURPOSE, charge_id: charge.id, tenant_id: charge.tenantId, kind: charge.kind },
    });
    if (init.accessCode) await deps.store.setAccessCode(charge.id, init.accessCode);
    return { charge, authorizationUrl: init.authorizationUrl, reference };
  } catch (error) {
    await deps.store.markNotPaid(charge.id, "failed", "Could not start the payment.").catch(() => undefined);
    throw error;
  }
}

// ---- Settle a charge ------------------------------------------------------------------------

export type VerifyOutcome =
  | { outcome: "unknown" }
  | { outcome: "paid" | "pending" | "failed" | "expired" | "refunded" | "mismatch"; charge: PlatformChargeRow; justPaid: boolean };

/**
 * Asks Paystack what happened to a charge and records it. Safe to call any number of times, from the
 * return page and the webhook at once: the row turns "paid" for exactly one caller, and only that
 * caller delivers the purchase and sends the receipt. The amount and currency come from our row and
 * must match what Paystack reports; the webhook's own payload is never trusted for them.
 */
export async function verifyCharge(reference: string, deps: ChargeDeps = defaultChargeDeps()): Promise<VerifyOutcome> {
  const existing = await deps.store.byReference(reference);
  if (!existing) return { outcome: "unknown" };

  if (existing.status === "paid") {
    // Paid earlier; if delivery never finished (crash, failure) this picks it up again.
    const charge = await deliverCharge(existing, deps);
    return { outcome: "paid", charge, justPaid: false };
  }
  if (existing.status === "refunded") return { outcome: "refunded", charge: existing, justPaid: false };

  const answer = await deps.gatewayFor(existing).verify(existing);
  const reload = async () => (await deps.store.byReference(reference)) ?? existing;

  if (answer.status === "success") {
    if (answer.reference !== existing.reference || answer.amountKobo !== existing.amountKobo || answer.currency.toUpperCase() !== existing.currency) {
      // Money moved but not the amount we asked for. Don't hand over what was bought; a person must look.
      console.error("[platform charge] amount mismatch", { chargeId: existing.id, expectedKobo: existing.amountKobo, reportedKobo: answer.amountKobo, currency: answer.currency });
      await deps.store.markNotPaid(existing.id, "failed", "amount_mismatch");
      return { outcome: "mismatch", charge: await reload(), justPaid: false };
    }
    const handlerStatus = getChargeKind(existing.kind)?.onPaid ? "pending" : "none";
    const won = await deps.store.markPaid(existing.id, deps.now().toISOString(), handlerStatus);
    if (!won) {
      // Someone else settled it a moment ago.
      const charge = await deliverCharge(await reload(), deps);
      return { outcome: charge.status === "paid" ? "paid" : "refunded", charge, justPaid: false };
    }
    const charge = await deliverCharge(won, deps);
    await sendReceiptOnce(charge, deps);
    return { outcome: "paid", charge, justPaid: true };
  }

  if (answer.status === "failed") {
    await deps.store.markNotPaid(existing.id, "failed", "The payment was declined.");
    return { outcome: "failed", charge: await reload(), justPaid: false };
  }

  // Abandoned or not yet paid: still pending, until it is old enough that nobody will finish it.
  if (deps.now().getTime() - new Date(existing.createdAt).getTime() > CHARGE_EXPIRY_MS) {
    await deps.store.markNotPaid(existing.id, "expired", null);
    return { outcome: "expired", charge: await reload(), justPaid: false };
  }
  return { outcome: "pending", charge: existing, justPaid: false };
}

// ---- Deliver what was paid for --------------------------------------------------------------

/**
 * Runs the kind's paid-handler for a paid charge. One caller claims it; a failure is written on the
 * charge (the payment stays paid) and can be retried with retryDelivery. Never throws.
 */
export async function deliverCharge(charge: PlatformChargeRow, deps: ChargeDeps): Promise<PlatformChargeRow> {
  if (charge.status !== "paid") return charge;
  const definition = getChargeKind(charge.kind);

  if (charge.handlerStatus === "none" || charge.handlerStatus === "done") return charge;
  if (!definition?.onPaid) {
    // The kind is no longer registered (a deploy without it): keep the charge waiting rather than dropping it.
    return charge;
  }

  const claimed = await deps.store.claimHandler(charge, deps.now()).catch(() => null);
  if (!claimed) return (await deps.store.byReference(charge.reference)) ?? charge;

  try {
    await definition.onPaid(claimed);
    await deps.store.finishHandler(claimed.id, true, null, deps.now());
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    console.error("[platform charge] paid-handler failed", { chargeId: claimed.id, kind: claimed.kind, message });
    await deps.store.finishHandler(claimed.id, false, message, deps.now()).catch(() => undefined);
  }
  return (await deps.store.byReference(claimed.reference)) ?? claimed;
}

/** Owner/admin pressed "Try again" on a paid charge whose delivery failed. */
export async function retryDelivery(reference: string, tenantId: string, deps: ChargeDeps = defaultChargeDeps()) {
  const charge = await deps.store.byReference(reference);
  if (!charge || charge.tenantId !== tenantId) return { ok: false as const, error: "We couldn't find that payment." };
  if (charge.status !== "paid") return { ok: false as const, error: "That payment hasn't been completed." };
  if (charge.handlerStatus === "done" || charge.handlerStatus === "none") return { ok: true as const, charge };
  const after = await deliverCharge(charge, deps);
  return { ok: true as const, charge: after };
}

async function sendReceiptOnce(charge: PlatformChargeRow, deps: ChargeDeps) {
  if (charge.receiptSentAt) return;
  try {
    // The sender records receipt_sent_at itself once the email has actually gone.
    await deps.sendReceipt(charge);
  } catch (error) {
    // A missing receipt must never undo or hide a payment.
    console.error("[platform charge] receipt email failed", { chargeId: charge.id, message: error instanceof Error ? error.message : String(error) });
  }
}
