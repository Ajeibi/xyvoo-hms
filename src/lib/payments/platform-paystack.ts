/**
 * XYVOO's own Paystack account: it processes every store payment (each store
 * is a Paystack subaccount, and XYVOO's platform fee is split off at
 * settlement) and bills the Standard plan. Keys come only from environment
 * variables and never reach the browser.
 *
 *   PAYSTACK_PLATFORM_SECRET_KEY   required for split payments and billing
 *   PAYSTACK_STANDARD_PLAN_CODE    the ₦10,000/month plan created in Paystack (PLN_…)
 *   PAYSTACK_SPLIT_BEARER          who pays Paystack's own charge on store sales:
 *                                  "subaccount" (the store, default) or "account" (XYVOO)
 */

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export type PlatformPaystack = {
  secretKey: string;
  standardPlanCode: string | null;
  splitBearer: "subaccount" | "account";
};

export function getPlatformPaystack(): PlatformPaystack | null {
  const secretKey = process.env.PAYSTACK_PLATFORM_SECRET_KEY;
  if (!secretKey) return null;
  return {
    secretKey,
    standardPlanCode: process.env.PAYSTACK_STANDARD_PLAN_CODE || null,
    splitBearer: process.env.PAYSTACK_SPLIT_BEARER === "account" ? "account" : "subaccount",
  };
}

export class PaystackError extends Error {}

async function paystack<T>(secretKey: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) throw new PaystackError(json?.message || "Paystack didn't accept the request.");
  return json.data as T;
}

export type PaystackBank = { name: string; code: string };

const bankCache = new Map<string, { at: number; banks: PaystackBank[] }>();

/** Banks Paystack can settle to in a currency, cached for an hour. */
export async function listBanks(config: PlatformPaystack, currency: string): Promise<PaystackBank[]> {
  const cached = bankCache.get(currency);
  if (cached && Date.now() - cached.at < 3_600_000) return cached.banks;
  const data = await paystack<Array<{ name: string; code: string; active: boolean; is_deleted: boolean | null }>>(
    config.secretKey,
    `/bank?currency=${encodeURIComponent(currency)}&perPage=200`,
  );
  const banks = data.filter((b) => b.active && !b.is_deleted).map((b) => ({ name: b.name, code: b.code }));
  bankCache.set(currency, { at: Date.now(), banks });
  return banks;
}

/** The account holder's name for an account number, so the merchant can confirm it's theirs. */
export async function resolveAccount(config: PlatformPaystack, accountNumber: string, bankCode: string) {
  const data = await paystack<{ account_name: string; account_number: string }>(
    config.secretKey,
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );
  return data.account_name;
}

/** percentageCharge is XYVOO's share as a percentage (4 for 4%); checkout overrides it per payment. */
export async function createSubaccount(
  config: PlatformPaystack,
  input: { businessName: string; bankCode: string; accountNumber: string; percentageCharge: number; email: string | null },
) {
  const data = await paystack<{ subaccount_code: string; settlement_bank: string }>(config.secretKey, "/subaccount", {
    method: "POST",
    body: {
      business_name: input.businessName,
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: input.percentageCharge,
      ...(input.email ? { primary_contact_email: input.email } : {}),
    },
  });
  return { subaccountCode: data.subaccount_code, bankName: data.settlement_bank };
}

export async function updateSubaccount(
  config: PlatformPaystack,
  code: string,
  input: { businessName: string; bankCode: string; accountNumber: string; percentageCharge: number },
) {
  await paystack(config.secretKey, `/subaccount/${encodeURIComponent(code)}`, {
    method: "PUT",
    body: {
      business_name: input.businessName,
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: input.percentageCharge,
    },
  });
}

/** Starts the first Standard payment; Paystack creates the subscription when it succeeds. */
export async function initializeSubscription(
  config: PlatformPaystack,
  input: { email: string; amountSubunits: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> },
) {
  if (!config.standardPlanCode) throw new PaystackError("The Standard plan isn't set up in Paystack yet.");
  const data = await paystack<{ authorization_url: string }>(config.secretKey, "/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amountSubunits,
      plan: config.standardPlanCode,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
  });
  return data.authorization_url;
}

export async function disableSubscription(config: PlatformPaystack, code: string, emailToken: string) {
  await paystack(config.secretKey, "/subscription/disable", { method: "POST", body: { code, token: emailToken } });
}
