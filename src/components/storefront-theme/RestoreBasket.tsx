"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCartStore } from "@/components/shop/CartProvider";
import { cartLineKey, type CartLine } from "@/lib/shop/cart";
import { announce, useStorefront } from "./StorefrontProvider";

/**
 * /cart?restore=<key>, from a basket reminder email: puts the saved basket back
 * (items already in the basket are left as they are), then tidies the address.
 */
export default function RestoreBasket() {
  const { slug } = useStorefront();
  const restoreKey = useSearchParams().get("restore");
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const lines = useCartStore((s) => s.lines);
  const addLine = useCartStore((s) => s.addLine);
  const started = useRef(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!restoreKey || !hasHydrated || started.current) return;
    started.current = true;
    const inBasket = new Set(lines.map((l) => cartLineKey(l.productId, l.variantId)));

    fetch(`/api/shop/${encodeURIComponent(slug)}/reminders?k=${encodeURIComponent(restoreKey)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        const saved: CartLine[] = ok && Array.isArray(body.lines) ? body.lines : [];
        const added = saved.filter((l) => !inBasket.has(cartLineKey(l.productId, l.variantId)));
        added.forEach((l) => addLine(l));
        const text = !ok
          ? "We couldn't find your saved basket. It may have expired."
          : added.length
            ? "Welcome back. We've put your basket back, with today's prices."
            : saved.length
              ? "Welcome back. Your basket is just as you left it."
              : "Sorry, the items in your saved basket are no longer available.";
        setMessage(text);
        announce(text);
      })
      .catch(() => setMessage("We couldn't load your saved basket. Check your internet connection and refresh the page."))
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("restore");
        window.history.replaceState(window.history.state, "", url.toString());
      });
  }, [restoreKey, hasHydrated, lines, addLine, slug]);

  if (!message) return null;
  return (
    <div className="container">
      <p className="price-change" role="status">
        {message}
      </p>
    </div>
  );
}
