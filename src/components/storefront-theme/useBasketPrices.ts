"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/components/shop/CartProvider";
import { cartLineKey, type LineAvailability } from "@/lib/shop/cart";

type FreshLine = { productId: string; variantId: string | null; unitPrice: number; taxRate: number; weightKg?: number };

/**
 * Brings the basket up to today's prices and stock: a sale may have started or
 * ended since something was added, and things sell out or are taken off sale. Asks the shop once whenever what's in the basket
 * changes, updates any prices that moved, and returns each line's tax rate.
 * `pricesChanged` is true when a price was updated, so the page can say so.
 */
export function useBasketPrices(slug: string) {
  const lines = useCartStore((s) => s.lines);
  const setPrices = useCartStore((s) => s.setPrices);
  const setAvailability = useCartStore((s) => s.setAvailability);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const [taxRates, setTaxRates] = useState<Record<string, number>>({});
  /** Each line's weight in kg, for delivery that is priced by weight. */
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [pricesChanged, setPricesChanged] = useState(false);
  const [trade, setTrade] = useState(false);
  const basketKey = lines.map((l) => `${cartLineKey(l.productId, l.variantId)}x${l.quantity}`).join(",");

  useEffect(() => {
    // No shop given: the caller doesn't need prices right now (a closed basket panel).
    if (!slug || !hasHydrated || lines.length === 0) return;
    let cancelled = false;
    fetch(`/api/shop/${encodeURIComponent(slug)}/basket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { lines?: FreshLine[]; trade?: boolean; availability?: LineAvailability[] } | null) => {
        if (cancelled || !data?.lines) return;
        // Today's stock: quantities capped, and lines that can no longer be bought marked.
        if (data.availability) setAvailability(data.availability);
        setTrade(Boolean(data.trade));
        const changed = data.lines.some((p) => {
          const line = lines.find((l) => cartLineKey(l.productId, l.variantId) === cartLineKey(p.productId, p.variantId));
          return line && Math.abs(line.unitPrice - p.unitPrice) >= 0.005;
        });
        setTaxRates(Object.fromEntries(data.lines.map((p) => [cartLineKey(p.productId, p.variantId), p.taxRate])));
        setWeights(Object.fromEntries(data.lines.map((p) => [cartLineKey(p.productId, p.variantId), p.weightKg ?? 0])));
        if (changed) {
          setPrices(data.lines);
          setPricesChanged(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only when what's in the basket changes; prices come back from this call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, basketKey, slug]);

  return { taxRates, weights, pricesChanged, trade };
}
