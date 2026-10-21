"use client";

/*
 * A discount code entered in the basket, kept in this browser so checkout
 * applies it without the shopper typing it again. Checkout checks it once more
 * and forgets it if it's no longer valid or the shopper removes it.
 */

const key = (slug: string) => `sf-basket-code:${slug}`;

export function getBasketCode(slug: string): string | null {
  try {
    return window.localStorage.getItem(key(slug));
  } catch {
    return null;
  }
}

export function setBasketCode(slug: string, code: string | null) {
  try {
    if (code) window.localStorage.setItem(key(slug), code);
    else window.localStorage.removeItem(key(slug));
  } catch {
    // Private browsing: the code is entered again at checkout.
  }
}

/*
 * What the shopper typed at checkout, kept for this browser tab only (it's
 * gone when the tab closes), so "Try again" after a card payment that didn't
 * go through brings the form back filled in. Cleared once an order is placed.
 */
export type CheckoutDetails = Partial<Record<"name" | "email" | "phone" | "line1" | "line2" | "city" | "state" | "postcode" | "note", string>>;
const detailsKey = (slug: string) => `sf-checkout-details:${slug}`;

export function saveCheckoutDetails(slug: string, details: CheckoutDetails) {
  try {
    window.sessionStorage.setItem(detailsKey(slug), JSON.stringify(details));
  } catch {
    // Private browsing: the form starts empty again.
  }
}

export function readCheckoutDetails(slug: string): CheckoutDetails | null {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(detailsKey(slug));
    return raw ? (JSON.parse(raw) as CheckoutDetails) : null;
  } catch {
    return null;
  }
}

export function clearCheckoutDetails(slug: string) {
  try {
    window.sessionStorage.removeItem(detailsKey(slug));
  } catch {
    // Nothing kept.
  }
}

/** Opens the basket drawer (BasketDrawer.tsx), e.g. after something is added. */
export function openBasketDrawer(added?: string) {
  window.dispatchEvent(new CustomEvent("sf:basket-open", { detail: { added } }));
}
