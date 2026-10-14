/*
 * A friend's link looks like /products?ref=FRIEND-7KQM2X. The code is kept in
 * the browser for 30 days and filled in at checkout, so the friend doesn't have
 * to type it. The shop's server still checks it, as it does for a typed code.
 */

export const REFERRAL_PARAM = "ref";
const REFERRAL_CODE = /^FRIEND-[A-HJKMNP-Z2-9]{6}$/;
const KEEP_MS = 30 * 86_400_000;

export const referralStorageKey = (slug: string) => `sf-ref:${slug}`;

/** The friend code in a query string like "?ref=friend-7kqm2x", or null. */
export function referralFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(REFERRAL_PARAM)?.trim().toUpperCase() ?? "";
  return REFERRAL_CODE.test(value) ? value : null;
}

/** What is stored for a shop: the code and when it arrived. */
export const encodeStoredReferral = (code: string, now = Date.now()) => JSON.stringify({ code, at: now });

/** The stored code if it is a valid code seen within the last 30 days. */
export function decodeStoredReferral(raw: string | null, now = Date.now()): string | null {
  if (!raw) return null;
  try {
    const { code, at } = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof code !== "string" || typeof at !== "number" || !REFERRAL_CODE.test(code)) return null;
    return now - at < KEEP_MS ? code : null;
  } catch {
    return null;
  }
}

/** The link to share: the shop's products page with the friend's code attached. */
export function referralLink(baseUrl: string, code: string) {
  return `${baseUrl.replace(/\/$/, "")}/products?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
}
