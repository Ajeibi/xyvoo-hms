import crypto from "crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

type InitializeTransactionParams = {
  secretKey: string;
  email: string;
  amountSubunit: number;
  reference: string;
  currency: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
};

type InitializeTransactionResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

/** No Paystack SDK is installed anywhere in this repo -- these are thin
 * fetch() wrappers around Paystack's REST API, matching the fact that no
 * payment integration of any kind existed here before this. */
export async function initializeTransaction(
  params: InitializeTransactionParams,
): Promise<InitializeTransactionResult> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountSubunit,
      currency: params.currency,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata || {},
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.status) {
    throw new Error(json?.message || "Failed to initialize payment with Paystack.");
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    reference: json.data.reference,
  };
}

type VerifyTransactionResult = {
  status: "success" | "failed" | "abandoned" | "pending";
  amountSubunit: number;
  currency: string;
  reference: string;
  authorizationCode: string | null;
  raw: unknown;
};

export async function verifyTransaction(params: {
  secretKey: string;
  reference: string;
}): Promise<VerifyTransactionResult> {
  const res = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(params.reference)}`,
    {
      headers: { Authorization: `Bearer ${params.secretKey}` },
    },
  );

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.status) {
    throw new Error(json?.message || "Failed to verify payment with Paystack.");
  }

  const data = json.data;

  return {
    status: data.status,
    amountSubunit: data.amount,
    currency: data.currency,
    reference: data.reference,
    authorizationCode: data.authorization?.authorization_code || null,
    raw: data,
  };
}

/** Constant-time signature check -- a plain === comparison would leak timing
 * information about how many leading bytes matched, in principle usable to
 * forge a valid signature byte-by-byte. timingSafeEqual throws on unequal
 * buffer lengths, so that's checked first rather than passed through. */
export function isValidWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;

  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");

  if (expectedBuf.length !== actualBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
