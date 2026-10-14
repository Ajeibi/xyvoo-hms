"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useStorefront } from "./StorefrontProvider";

/*
 * The signed-in shopper, shared by the header, the account invitation, the
 * Account page and checkout. Loaded once per page load and refreshed after
 * signing in or out.
 */

export type ShopAccount = { name: string | null; email: string; phone: string | null; contactConsent: boolean; confirmed: boolean };
export type ShopAddress = { line1: string; line2: string; city: string; state: string };
export type ShopLoyalty = { balance: number; pointValue: number; minRedeem: number; pointsPer100: number; history?: { id: string; points: number; reason: string; note: string | null; createdAt: string }[] };
export type ShopReferral = { code: string; link: string; friendOffer: string; reward: string; friends: number; pointsEarned: number; giftCardsEarned: string };
export type ShopAccountState = { status: "loading" | "ready"; account: ShopAccount | null; address: ShopAddress | null; loyalty: ShopLoyalty | null };

const LOADING: ShopAccountState = { status: "loading", account: null, address: null, loyalty: null };
const states = new Map<string, ShopAccountState>();
const listeners = new Map<string, Set<() => void>>();
const loading = new Set<string>();

const emit = (slug: string, next: ShopAccountState) => {
  states.set(slug, next);
  listeners.get(slug)?.forEach((fn) => fn());
};

/** Reloads the signed-in shopper (after signing in, out or changing details). */
export async function refreshShopAccount(slug: string) {
  loading.add(slug);
  try {
    const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/account`, { cache: "no-store" });
    const body = res.ok ? await res.json() : {};
    emit(slug, { status: "ready", account: body.account ?? null, address: body.address ?? null, loyalty: body.loyalty ?? null });
  } catch {
    emit(slug, { status: "ready", account: null, address: null, loyalty: null });
  }
}

export function useShopAccount(): ShopAccountState {
  const { slug } = useStorefront();
  const state = useSyncExternalStore(
    (onChange) => {
      const set = listeners.get(slug) ?? new Set();
      set.add(onChange);
      listeners.set(slug, set);
      return () => set.delete(onChange);
    },
    () => states.get(slug) ?? LOADING,
    () => LOADING,
  );
  useEffect(() => {
    if (!loading.has(slug)) void refreshShopAccount(slug);
  }, [slug]);
  return state;
}

/** Tells the shop what a signed-in shopper is doing (see /account/activity). Never throws. */
export function sendAccountActivity(slug: string, body: object) {
  fetch(`/api/shop/${encodeURIComponent(slug)}/account/activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
