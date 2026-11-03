import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * The online check-in link: signed, so only someone who was sent it can open it. It names one stay
 * and runs out 30 days after it was made, which is past any arrival it was sent for.
 */
export const ONLINE_CHECKIN_LINK_DAYS = 30;

function secret() {
  const key = process.env.HMS_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("No secret to sign check-in links with.");
  return key;
}

const sign = (payload: string) => createHmac("sha256", `hms-online-checkin-link:${secret()}`).update(payload).digest("base64url");

export function signCheckInToken(tenantId: string, reservationId: string, days = ONLINE_CHECKIN_LINK_DAYS, now = Date.now()) {
  const payload = Buffer.from(`${tenantId}.${reservationId}.${Math.floor(now / 1000) + days * 86400}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyCheckInToken(token: string, now = Date.now()): { tenantId: string; reservationId: string } | null {
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [tenantId, reservationId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!tenantId || !reservationId || !(Number(exp) * 1000 > now)) return null;
  return { tenantId, reservationId };
}
