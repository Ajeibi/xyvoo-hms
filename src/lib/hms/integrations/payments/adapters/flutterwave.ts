import { timingSafeEqual } from "node:crypto";
import { parseJson, realFetch, timedFetch, type FetchLike } from "../../http-fetch";
import type { PaymentMode, PaymentProvider, PaymentResult, Verification, WebhookEvent } from "../types";

/*
 * The only file that knows Flutterwave. Written from the Flutterwave v3 documentation
 * (developer.flutterwave.com): Bearer secret key; hosted checkout at POST /payments returning a link;
 * POST-back webhooks carrying our secret hash in the `verif-hash` header; the result always confirmed
 * with GET /transactions/verify_by_reference; refunds at POST /transactions/:id/refund. Sandbox keys
 * start FLWSECK_TEST, live ones FLWSECK-.
 *
 * Things to check against a real sandbox (marked VERIFY): the webhook payload field names, the status
 * words on verify ("successful"), and the refund response shape.
 */

export type FlutterwaveOptions = {
  secretKey?: string;
  secretHash?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

const DEFAULT_BASE = "https://api.flutterwave.com/v3";

export function flutterwaveMode(secretKey: string | undefined): PaymentMode {
  if (!secretKey) return "unknown";
  if (secretKey.startsWith("FLWSECK_TEST")) return "test";
  if (secretKey.startsWith("FLWSECK-")) return "live";
  return "unknown";
}

const asNumber = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const asString = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createFlutterwaveProvider(opts: FlutterwaveOptions = {}): PaymentProvider {
  const f = opts.fetchImpl ?? realFetch;
  const secretKey = opts.secretKey ?? process.env.FLUTTERWAVE_SECRET_KEY?.trim();
  const secretHash = opts.secretHash ?? process.env.FLUTTERWAVE_SECRET_HASH?.trim();
  const base = (opts.baseUrl ?? process.env.FLUTTERWAVE_BASE_URL?.trim() ?? DEFAULT_BASE).replace(/\/$/, "");

  async function call(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<PaymentResult<Record<string, unknown>>> {
    if (!secretKey) return { ok: false, error: "Flutterwave is not set up on this server (FLUTTERWAVE_SECRET_KEY).", retryable: false };
    let res;
    try {
      res = await timedFetch(f, `${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      return { ok: false, error: "Could not reach Flutterwave.", retryable: true };
    }
    const json = parseJson(await res.text().catch(() => ""));
    if (res.status === 429 || res.status >= 500) return { ok: false, error: `Flutterwave returned ${res.status}.`, retryable: true };
    if (!res.ok || json.status !== "success") {
      return { ok: false, error: asString(json.message) ?? `Flutterwave returned ${res.status}.`, retryable: false };
    }
    return { ok: true, data: json };
  }

  return {
    id: "flutterwave",
    mode: flutterwaveMode(secretKey),
    isConfigured: () => Boolean(secretKey),

    async createCheckout(input) {
      if (!(input.amount > 0)) return { ok: false, error: "The amount must be more than zero.", retryable: false };
      const r = await call("POST", "/payments", {
        tx_ref: input.reference,
        amount: Math.round(input.amount * 100) / 100,
        currency: input.currency,
        redirect_url: input.redirectUrl,
        customer: { email: input.email, ...(input.name ? { name: input.name } : {}), ...(input.phone ? { phonenumber: input.phone } : {}) },
        customizations: { title: input.description.slice(0, 60) },
        ...(input.meta ? { meta: input.meta } : {}),
      });
      if (!r.ok) return r;
      const link = asString(asObj(r.data.data).link);
      if (!link) return { ok: false, error: "Flutterwave did not return a payment link.", retryable: false };
      return { ok: true, data: { checkoutUrl: link } };
    },

    async verifyByReference(reference) {
      const r = await call("GET", `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);
      if (!r.ok) {
        // "No transaction was found" means the guest has not paid yet, not that something broke.
        if (/no transaction/i.test(r.error)) return { ok: true, data: { status: "pending", amount: null, currency: null, providerTransactionId: null, reference } };
        return r;
      }
      const d = asObj(r.data.data);
      const word = asString(d.status)?.toLowerCase();
      const status: Verification["status"] = word === "successful" ? "successful" : word === "failed" ? "failed" : "pending";
      return {
        ok: true,
        data: {
          status,
          amount: asNumber(d.amount),
          currency: asString(d.currency),
          providerTransactionId: asString(d.id),
          reference: asString(d.tx_ref) ?? reference,
        },
      };
    },

    verifyWebhook(headers) {
      if (!secretHash) return false;
      const given = headers.get("verif-hash");
      return Boolean(given) && safeEqual(given as string, secretHash);
    },

    parseWebhook(rawBody): WebhookEvent | null {
      const body = parseJson(rawBody);
      const d = asObj(body.data);
      const reference = asString(d.tx_ref);
      if (!reference) return null;
      return { reference, providerTransactionId: asString(d.id), event: asString(body.event) ?? asString(body["event.type"]) ?? "unknown" };
    },

    async refund({ providerTransactionId, amount }) {
      if (!(amount > 0)) return { ok: false, error: "The refund must be more than zero.", retryable: false };
      const r = await call("POST", `/transactions/${encodeURIComponent(providerTransactionId)}/refund`, { amount: Math.round(amount * 100) / 100 });
      if (!r.ok) return r;
      return { ok: true, data: { refundId: asString(asObj(r.data.data).id) } };
    },
  };
}
