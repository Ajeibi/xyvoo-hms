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

/** Opens the basket drawer (BasketDrawer.tsx), e.g. after something is added. */
export function openBasketDrawer(added?: string) {
  window.dispatchEvent(new CustomEvent("sf:basket-open", { detail: { added } }));
}
