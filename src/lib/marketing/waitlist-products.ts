import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";

/** The waitlist's product choices. Safe for the browser: no email or server code here. */
export const WAITLIST_PRODUCTS = ["hms", "storefront", "both"] as const;
export type WaitlistProduct = (typeof WAITLIST_PRODUCTS)[number];

/** The choices on the form, in order. */
export const WAITLIST_CHOICES: ReadonlyArray<{ value: WaitlistProduct; label: string; hint: string }> = [
  { value: "hms", label: XYVOO_AUTH_ROUTES.hms.title, hint: "For hotels: front desk, rooms and operations" },
  { value: "storefront", label: XYVOO_AUTH_ROUTES.storefront.title, hint: "For shops: your own online store and orders" },
  { value: "both", label: "Both", hint: "I'm interested in HMS and Storefront" },
];

export function parseWaitlistProduct(value: string | string[] | undefined): WaitlistProduct | null {
  return typeof value === "string" && (WAITLIST_PRODUCTS as readonly string[]).includes(value) ? (value as WaitlistProduct) : null;
}

/** "XYVOO Storefront", "XYVOO HMS", both, or plain "XYVOO" if we don't know. */
export function waitlistProductName(product: WaitlistProduct | null | undefined) {
  if (product === "hms") return "XYVOO HMS";
  if (product === "storefront") return "XYVOO Storefront";
  if (product === "both") return "XYVOO HMS and Storefront";
  return "XYVOO";
}
