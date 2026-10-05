/**
 * Pre-launch lock for sign-in and registration.
 *
 * Locked unless NEXT_PUBLIC_AUTH_LOCKED is explicitly "false", so a fresh
 * deployment is never accidentally open. The team bypasses it by visiting
 * any page with ?preview=<AUTH_PREVIEW_SECRET>, which sets a cookie.
 */
export const AUTH_LOCKED = process.env.NEXT_PUBLIC_AUTH_LOCKED !== "false";

export const AUTH_PREVIEW_COOKIE = "xyvoo_preview";
export const AUTH_PREVIEW_PARAM = "preview";
export const COMING_SOON_PATH = "/coming-soon";

/** Pages that redirect to the coming-soon page while locked. */
export const LOCKED_PAGE_PREFIXES = ["/auth/login", "/auth/forgot-password", "/register"];

/** API routes that return 403 while locked. */
export const LOCKED_API_PREFIXES = [
  "/api/auth",
  "/api/store/auth",
  "/api/store/register",
  "/api/hotel/register",
  "/api/platform/onboard-hotel",
];

export function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** The cookie stores a hash of the secret, never the secret itself. */
export async function previewToken(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`xyvoo-preview:${secret}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
