import { z } from "zod";

/**
 * Root domain storefronts are served under, e.g. `linden.getxyvoo.com`.
 * Kept in one env var so stores can move to a dedicated domain later.
 */
export const STOREFRONT_ROOT_DOMAIN = process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN || "getxyvoo.com";

/**
 * Request header the proxy sets (to the store slug) when a request arrives on a
 * store's own subdomain. The proxy strips any copy sent by the browser, so pages
 * can trust it.
 */
export const STOREFRONT_HOST_HEADER = "x-storefront-host";

/**
 * Also set only by the proxy: the path within the store being requested
 * (e.g. "/products/mug"), so a store that changed its address can send old
 * links to the same page at the new address.
 */
export const STOREFRONT_PATH_HEADER = "x-storefront-path";

/**
 * Set (scoped to /shop/<slug>) when a store member opens the website editor's
 * preview with ?sfpreview=1, so they see unpublished changes even on a live
 * shop. It only switches to the draft for signed-in members of that store;
 * for anyone else it does nothing.
 */
export const STOREFRONT_PREVIEW_COOKIE = "sf_draft_preview";
export const STOREFRONT_PREVIEW_PARAM = "sfpreview";

/** Names a merchant can't claim: platform hosts, or names that look official. */
export const RESERVED_SUBDOMAINS = new Set([
  "account",
  "accounts",
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "blog",
  "cdn",
  "checkout",
  "dashboard",
  "dev",
  "docs",
  "email",
  "ftp",
  "help",
  "hms",
  "hotel",
  "img",
  "login",
  "mail",
  "media",
  "ns1",
  "ns2",
  "pay",
  "payments",
  "preview",
  "register",
  "secure",
  "shop",
  "smtp",
  "staging",
  "static",
  "status",
  "store",
  "storefront",
  "support",
  "test",
  "www",
  "xyvoo",
]);

const SUBDOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export function slugifyStoreName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

export function isReservedSubdomain(slug: string) {
  return RESERVED_SUBDOMAINS.has(slug.toLowerCase());
}

export const storeSubdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SUBDOMAIN_PATTERN, "Use 3 to 63 lowercase letters, numbers and hyphens, starting and ending with a letter or number.")
  .refine((slug) => !isReservedSubdomain(slug), "That address is reserved. Please choose another.");

export function storefrontHost(slug: string) {
  return `${slug}.${STOREFRONT_ROOT_DOMAIN}`;
}

export function storefrontUrl(slug: string) {
  return `https://${storefrontHost(slug)}`;
}

/**
 * Paths a store subdomain serves as-is rather than as store pages: API routes
 * (checkout, payment verification), Next.js assets and shared static files.
 */
const STOREFRONT_PASSTHROUGH_PREFIXES = ["/api/", "/_next/", "/sf-assets/", "/__nextjs"];

/**
 * Internal path a request on a store's subdomain is served from, e.g.
 * linden.getxyvoo.com/products -> /shop/linden/products. Null means serve the
 * path unchanged.
 */
export function storefrontRewritePath(slug: string, pathname: string): string | null {
  if (STOREFRONT_PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  return pathname === "/" ? `/shop/${slug}` : `/shop/${slug}${pathname}`;
}

/**
 * Returns the store slug when `host` is a storefront subdomain of the root domain
 * (or of `localhost` in development), otherwise null. Ports are ignored.
 */
export function getStoreSlugFromHost(host: string | null, rootDomain = STOREFRONT_ROOT_DOMAIN) {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();

  for (const root of [rootDomain.toLowerCase(), "localhost"]) {
    if (!hostname.endsWith(`.${root}`)) continue;
    const label = hostname.slice(0, -(root.length + 1));
    if (!label || label.includes(".")) return null;
    if (!SUBDOMAIN_PATTERN.test(label) || isReservedSubdomain(label)) return null;
    return label;
  }

  return null;
}

/**
 * Where a request for a store's old address should go once the store has
 * moved to newSlug, keeping the page path. `path` is the path within the
 * store (STOREFRONT_PATH_HEADER); `subdomainSlug` is set when the request came
 * in on the old subdomain (STOREFRONT_HOST_HEADER).
 */
export function movedStoreLocation(input: { oldSlug: string; newSlug: string; path: string | null; host: string | null; subdomainSlug: string | null; protocol: string | null }) {
  const oldSlug = input.oldSlug.toLowerCase();
  // Only same-site paths: "//host" or "/\host" would make this an open redirect.
  const path = input.path && /^\/(?![/\\])\S*$/.test(input.path) ? input.path : "/";

  // On the old subdomain, swap the first label of the host so the port and
  // root domain (localhost in development) stay as they are.
  const host = (input.host || "").toLowerCase();
  if (input.subdomainSlug === oldSlug && host.startsWith(`${oldSlug}.`)) {
    const protocol = input.protocol === "http" ? "http" : "https";
    return `${protocol}://${input.newSlug}${host.slice(oldSlug.length)}${path}`;
  }
  return `/shop/${input.newSlug}${path === "/" ? "" : path}`;
}
