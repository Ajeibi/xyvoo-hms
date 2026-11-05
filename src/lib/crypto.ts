import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * App-level secrets helpers (server only).
 *
 * - encryptSecret / decryptSecret: AES-256-GCM for tokens stored in the database.
 * - signPayload / verifyPayload: HMAC-signed, expiring blobs (used for OAuth `state`).
 *
 * Both use ACCOUNTING_ENCRYPTION_KEY: 32 random bytes, base64 or 64 hex chars.
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Nothing here ever logs the key or the plaintext.
 */

const KEY_ENV = "ACCOUNTING_ENCRYPTION_KEY";

export function loadEncryptionKey(raw: string | undefined = process.env[KEY_ENV]): Buffer {
  if (!raw) throw new Error(`Missing required env var: ${KEY_ENV}`);
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== 32) throw new Error(`${KEY_ENV} must decode to exactly 32 bytes.`);
  return key;
}

/** Output format: v1.<iv>.<tag>.<ciphertext>, each part base64url. */
export function encryptSecret(plaintext: string, key: Buffer = loadEncryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, key: Buffer = loadEncryptionKey()): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised encrypted value.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

function mac(body: string, key: Buffer): string {
  return createHmac("sha256", key).update(`xyvoo-signed-payload:${body}`).digest("base64url");
}

/** Signs a JSON object and stamps it with an expiry (`exp`, epoch seconds). */
export function signPayload(data: Record<string, unknown>, ttlSeconds: number, key: Buffer = loadEncryptionKey(), nowMs = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(nowMs / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${mac(body, key)}`;
}

/** Returns the payload if the signature is valid and it has not expired, otherwise null. */
export function verifyPayload<T extends Record<string, unknown>>(
  token: string,
  key: Buffer = loadEncryptionKey(),
  nowMs = Date.now(),
): (T & { exp: number }) | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < nowMs) return null;
    return parsed as T & { exp: number };
  } catch {
    return null;
  }
}
