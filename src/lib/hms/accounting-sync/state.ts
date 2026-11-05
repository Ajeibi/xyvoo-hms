import { randomBytes } from "node:crypto";
import { signPayload, verifyPayload } from "@/lib/crypto";

/** OAuth `state`: signed, short-lived, bound to one hotel and one signed-in user. */

export const STATE_TTL_SECONDS = 600;

export type OAuthState = {
  tid: string; // tenant id
  uid: string; // user id
  slug: string;
  syncFrom: string; // YYYY-MM-DD
  nonce: string;
};

export function createOAuthState(params: { tenantId: string; userId: string; slug: string; syncFrom: string }, key?: Buffer, nowMs?: number): string {
  return signPayload(
    { tid: params.tenantId, uid: params.userId, slug: params.slug, syncFrom: params.syncFrom, nonce: randomBytes(12).toString("base64url") },
    STATE_TTL_SECONDS,
    key,
    nowMs,
  );
}

/** Returns the state only when it is genuine, unexpired and was issued for exactly this hotel and user. */
export function validateOAuthState(
  raw: string | null | undefined,
  expected: { tenantId: string; userId: string },
  key?: Buffer,
  nowMs?: number,
): OAuthState | null {
  if (!raw) return null;
  const s = verifyPayload<OAuthState>(raw, key, nowMs);
  if (!s || s.tid !== expected.tenantId || s.uid !== expected.userId) return null;
  return s;
}

/** Reads the state without checking who is asking, so the callback can find which hotel it belongs to. */
export function peekOAuthState(raw: string | null | undefined, key?: Buffer, nowMs?: number): OAuthState | null {
  if (!raw) return null;
  return verifyPayload<OAuthState>(raw, key, nowMs);
}
