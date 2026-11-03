import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * The feedback link: signed, so only someone who was sent it can answer, and good for 60 days. It
 * names one stay, so a guest can answer once per stay and nothing else.
 */
export const FEEDBACK_LINK_DAYS = 60;

function secret() {
  const key = process.env.HMS_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("No secret to sign feedback links with.");
  return key;
}

const sign = (payload: string) => createHmac("sha256", `hms-feedback-link:${secret()}`).update(payload).digest("base64url");

export function signFeedbackToken(tenantId: string, reservationId: string, days = FEEDBACK_LINK_DAYS, now = Date.now()) {
  const payload = Buffer.from(`${tenantId}.${reservationId}.${Math.floor(now / 1000) + days * 86400}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyFeedbackToken(token: string, now = Date.now()): { tenantId: string; reservationId: string } | null {
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [tenantId, reservationId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!tenantId || !reservationId || !(Number(exp) * 1000 > now)) return null;
  return { tenantId, reservationId };
}
