"use client";

import { useEffect, useRef } from "react";
import { useCartStore } from "@/components/shop/CartProvider";
import { useStorefront } from "./StorefrontProvider";
import { sendAccountActivity, useShopAccount } from "./useShopAccount";

/**
 * For signed-in shoppers only: keeps their basket on their account, so it
 * follows them to other devices and the shop can see what they're interested
 * in. Product views are sent by TrackProductView. Nothing is sent for guests.
 */
export default function AccountActivity() {
  const { slug } = useStorefront();
  const { account } = useShopAccount();
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!account || !hasHydrated) return;
    const basket = lines.map((l) => ({ productId: l.productId, variantId: l.variantId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice }));
    const key = JSON.stringify(basket);
    if (key === last.current) return;
    last.current = key;
    const timer = window.setTimeout(() => sendAccountActivity(slug, { basket }), 1500);
    return () => window.clearTimeout(timer);
  }, [account, hasHydrated, lines, slug]);

  return null;
}
