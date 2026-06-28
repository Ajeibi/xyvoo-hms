import type { PaystackInitializeResult, PaystackVerifyData } from "./types";

const PAYSTACK_BASE = "https://api.paystack.co";

type PaystackApiResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

async function paystackRequest<T>(
  secretKey: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as PaystackApiResponse<T> & { message?: string };
  if (!res.ok || !json.status) {
    return { ok: false, message: json.message ?? `Paystack error (${res.status})` };
  }
  return { ok: true, data: json.data };
}

export async function paystackInitializeTransaction(params: {
  secretKey: string;
  email: string;
  amount: number;
  currency: string;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
}): Promise<{ ok: true; result: PaystackInitializeResult } | { ok: false; message: string }> {
  const amountKobo = Math.round(params.amount * 100);
  const body: Record<string, unknown> = {
    email: params.email,
    amount: amountKobo,
    currency: params.currency,
    reference: params.reference,
    metadata: params.metadata ?? {},
  };
  if (params.callbackUrl) body.callback_url = params.callbackUrl;
  if (params.channels?.length) body.channels = params.channels;

  const res = await paystackRequest<{
    reference: string;
    access_code: string;
    authorization_url: string;
  }>(params.secretKey, "/transaction/initialize", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) return res;
  return {
    ok: true,
    result: {
      reference: res.data.reference,
      accessCode: res.data.access_code,
      authorizationUrl: res.data.authorization_url,
    },
  };
}

export async function paystackVerifyTransaction(
  secretKey: string,
  reference: string,
): Promise<{ ok: true; data: PaystackVerifyData } | { ok: false; message: string }> {
  const res = await paystackRequest<PaystackVerifyData>(
    secretKey,
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

export async function paystackChargeAuthorization(params: {
  secretKey: string;
  authorizationCode: string;
  email: string;
  amount: number;
  currency: string;
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: true; data: PaystackVerifyData } | { ok: false; message: string }> {
  const amountKobo = Math.round(params.amount * 100);
  const res = await paystackRequest<PaystackVerifyData>(params.secretKey, "/transaction/charge_authorization", {
    method: "POST",
    body: JSON.stringify({
      authorization_code: params.authorizationCode,
      email: params.email,
      amount: amountKobo,
      currency: params.currency,
      reference: params.reference,
      metadata: params.metadata ?? {},
    }),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

export async function paystackRefund(params: {
  secretKey: string;
  transactionReference: string;
  amount?: number;
  currency?: string;
  customerNote?: string;
  merchantNote?: string;
}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string }> {
  const body: Record<string, unknown> = { transaction: params.transactionReference };
  if (params.amount != null) body.amount = Math.round(params.amount * 100);
  if (params.currency) body.currency = params.currency;
  if (params.customerNote) body.customer_note = params.customerNote;
  if (params.merchantNote) body.merchant_note = params.merchantNote;

  const res = await paystackRequest<Record<string, unknown>>(params.secretKey, "/refund", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}
