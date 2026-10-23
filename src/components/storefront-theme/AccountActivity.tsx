"use client";

import { useEffect, useRef, useState } from "react";
import { useCartStore } from "@/components/shop/CartProvider";
import type { CartLine } from "@/lib/shop/cart";
import { announce, useStorefront, useT } from "./StorefrontProvider";
import { sendAccountActivity, useShopAccount } from "./useShopAccount";

/**
 * For signed-in shoppers only: keeps their basket on their account, so it
 * follows them to other devices, and the shop can see what they're interested
 * in. On a device that has confirmed the email, the account's basket is read
 * first, and replaces this device's when it was changed more recently (so
 * removing something on the phone removes it on the laptop too). Product views
 * are sent by TrackProductView. Nothing is sent for guests.
 */
export default function AccountActivity() {
  const { slug } = useStorefront();
  const t = useT();
  const { account } = useShopAccount();
  const lines = useCartStore((s) => s.lines);
  const updatedAt = useCartStore((s) => s.updatedAt);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const replaceLines = useCartStore((s) => s.replaceLines);
  const last = useRef<string | null>(null);
  // Saving waits until the account's basket has been checked, so an older basket here can't overwrite a newer one there.
  const [synced, setSynced] = useState<string | null>(null);
  const who = account ? `${slug}:${account.email}` : null;

  useEffect(() => {
    // Only a device that has confirmed the email may read the account's basket.
    if (!who || !hasHydrated || synced === who || !account?.confirmed) return;
    let cancelled = false;
    fetch(`/api/shop/${encodeURIComponent(slug)}/account/basket`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { lines?: CartLine[]; updatedAt?: number } | null) => {
        if (cancelled) return;
        const theirs = Number(data?.updatedAt) || 0;
        if (data?.lines && theirs > updatedAt) {
          replaceLines(data.lines, theirs);
          if (data.lines.length) announce(t("account.basketBroughtOver"));
        }
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setSynced(who));
    return () => {
      cancelled = true;
    };
  }, [who, account?.confirmed, hasHydrated, synced, slug, replaceLines, updatedAt, t]);

  useEffect(() => {
    const checked = synced === who || !account?.confirmed;
    if (!account || !hasHydrated || !checked) return;
    const basket = lines.map((l) => ({ productId: l.productId, variantId: l.variantId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice }));
    const key = JSON.stringify(basket);
    if (key === last.current) return;
    last.current = key;
    // Only a change made here is sent; the basket just brought over from the account is already there.
    if (!updatedAt) return;
    const timer = window.setTimeout(() => sendAccountActivity(slug, { basket }), 1500);
    return () => window.clearTimeout(timer);
  }, [account, hasHydrated, lines, slug, synced, who, updatedAt]);

  return null;
}
