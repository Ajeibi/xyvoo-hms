"use client";

import { useEffect, useState } from "react";
import { useStorefront } from "./StorefrontProvider";

/**
 * The trade price under a product's price, shown only to a signed-in customer
 * with an approved trade account. Everyone else gets nothing here, and the
 * price isn't in the page they were sent.
 */
export default function TradePrice({ productId }: { productId: string }) {
  const { slug } = useStorefront();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shop/${encodeURIComponent(slug)}/account/trade?product=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((res): Promise<{ trade?: { text: string } | null }> => (res.ok ? res.json() : Promise.resolve({})))
      .then((body) => !cancelled && setText(body.trade?.text ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug, productId]);

  return text ? <p className="trade-price">{text}</p> : null;
}
