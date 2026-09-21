import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { isValidWebhookSignature } from "./paystack";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

describe("isValidWebhookSignature", () => {
  const secret = "whsec_test_tenant_secret";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "abc123", amount: 100000 } });

  it("accepts a signature computed with the correct secret over the exact raw body", () => {
    expect(isValidWebhookSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret (e.g. another tenant's)", () => {
    expect(isValidWebhookSignature(body, sign(body, "someone-elses-secret"), secret)).toBe(false);
  });

  it("rejects when the body has been tampered with after signing", () => {
    const validSignature = sign(body, secret);
    const tamperedBody = JSON.stringify({ event: "charge.success", data: { reference: "abc123", amount: 999999999 } });
    expect(isValidWebhookSignature(tamperedBody, validSignature, secret)).toBe(false);
  });

  it("rejects a missing signature header outright", () => {
    expect(isValidWebhookSignature(body, null, secret)).toBe(false);
  });

  it("rejects an empty-string signature", () => {
    expect(isValidWebhookSignature(body, "", secret)).toBe(false);
  });

  it("rejects garbage/malformed signature input without throwing", () => {
    expect(() => isValidWebhookSignature(body, "not-a-hex-signature", secret)).not.toThrow();
    expect(isValidWebhookSignature(body, "not-a-hex-signature", secret)).toBe(false);
  });

  it("rejects a signature that's a different length than expected (would crash a naive timingSafeEqual call)", () => {
    expect(isValidWebhookSignature(body, "ab", secret)).toBe(false);
  });

  it("re-serialized JSON with the same data but different key order/whitespace does not verify -- proves why the route must HMAC the raw text, never a re-stringified object", () => {
    const reserialized = JSON.stringify({ data: { amount: 100000, reference: "abc123" }, event: "charge.success" });
    const validSignatureForOriginal = sign(body, secret);
    expect(reserialized).not.toBe(body);
    expect(isValidWebhookSignature(reserialized, validSignatureForOriginal, secret)).toBe(false);
  });
});
