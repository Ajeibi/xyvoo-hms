"use client";

import { useEffect } from "react";
import { useCartStore } from "@/components/shop/CartProvider";
import { clearCheckoutToken } from "@/lib/store/analytics-client";
import { useStorefront } from "./StorefrontProvider";

/** Empties the basket once an order has been placed (offline orders don't go through the payment callback). */
export default function ClearBasket() {
  const { slug } = useStorefront();
  const clear = useCartStore((s) => s.clear);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  useEffect(() => {
    if (!hasHydrated) return;
    clear();
    clearCheckoutToken(slug);
  }, [hasHydrated, clear, slug]);
  return null;
}
