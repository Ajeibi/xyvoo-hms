/**
 * Hotel websites: names shared by the proxy, the /stay route and the HMS settings.
 * Client-safe (no server imports).
 */

/** The three hotel templates (src/constants/website-templates.ts), by slug. */
export const HOTEL_TEMPLATE_IDS = ["coral-tide", "fernhollow", "aldwin"] as const;
export type HotelTemplateId = (typeof HOTEL_TEMPLATE_IDS)[number];

export function isHotelTemplateId(value: unknown): value is HotelTemplateId {
  return typeof value === "string" && (HOTEL_TEMPLATE_IDS as readonly string[]).includes(value);
}

/**
 * Request header the proxy sets (to the hotel's tenant slug) when a request arrives on a
 * hotel's own subdomain. The proxy strips any copy sent by the browser, so pages can trust it.
 */
export const HOTEL_SITE_HOST_HEADER = "x-hotel-site-host";

/**
 * Set (scoped to /stay/<slug>) when hotel staff open the draft with ?hspreview=1. The cookie alone
 * shows nothing: an unpublished site is only served to signed-in staff of that hotel.
 */
export const HOTEL_PREVIEW_COOKIE = "hs_draft_preview";
export const HOTEL_PREVIEW_PARAM = "hspreview";

/** Hotel websites send booking requests here; the hotel is told apart by the site's own host or path. */
export const BOOKING_REQUEST_ENDPOINT = "/api/public/booking-request";

/** Address changes allowed in 30 days, as for stores. */
export const MAX_ADDRESS_CHANGES_PER_30_DAYS = 3;
export const ADDRESS_REDIRECT_DAYS = 90;

/**
 * Paths a hotel subdomain serves as-is rather than as site pages: API routes (booking
 * requests), Next.js internals and the shared template assets.
 */
export const HOTEL_PASSTHROUGH_PREFIXES = ["/api/", "/_next/", "/template-previews/", "/__nextjs"];

/** Internal path a request on a hotel's subdomain is served from. Null means serve the path unchanged. */
export function hotelRewritePath(slug: string, pathname: string): string | null {
  if (HOTEL_PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  return pathname === "/" ? `/stay/${slug}` : `/stay/${slug}${pathname}`;
}
