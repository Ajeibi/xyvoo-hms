"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/components/shop/CartProvider";
import { cartLineKey } from "@/lib/shop/cart";
import { getConsent, initStoreAnalytics, onConsentChange, reopenCookieSettings, setConsent, track, type ConsentChoice } from "@/lib/store/analytics-client";

/*
 * The store's cookie banner and automatic tracking: page views, searches and
 * basket changes. Tracking only starts once the visitor accepts analytics
 * cookies, and "Reject" is as easy as "Accept". The banner is fixed to the
 * bottom of the screen, so it never moves the page.
 */

const useConsent = (slug: string) =>
  useSyncExternalStore<ConsentChoice | null | "unknown">(
    (onChange) => {
      const off = onConsentChange(onChange);
      return () => {
        off();
      };
    },
    () => getConsent(slug),
    () => "unknown",
  );

export default function StoreAnalytics({ slug, storeName, privacyHref }: { slug: string; storeName: string; privacyHref: string | null }) {
  const consent = useConsent(slug);
  const [reopened, setReopened] = useState(false);
  const pathname = usePathname();
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const previousLines = useRef<Map<string, { quantity: number; unitPrice: number; productId: string }> | null>(null);

  useEffect(() => {
    initStoreAnalytics(slug);
    const open = () => setReopened(true);
    window.addEventListener("sf:cookie-settings", open);
    return () => window.removeEventListener("sf:cookie-settings", open);
  }, [slug]);

  // Page views and searches.
  useEffect(() => {
    if (consent !== "accepted") return;
    track({ type: "page_view", path: pathname });
    const search = new URLSearchParams(window.location.search).get("search");
    if (search && /\/products$/.test(pathname)) track({ type: "search", path: pathname, searchTerm: search.slice(0, 100) });
  }, [pathname, consent]);

  // Basket changes: compare with the basket as it was, once it has loaded.
  useEffect(() => {
    if (!hasHydrated) return;
    const current = new Map(lines.map((l) => [cartLineKey(l.productId, l.variantId), { quantity: l.quantity, unitPrice: l.unitPrice, productId: l.productId }]));
    const before = previousLines.current;
    previousLines.current = current;
    if (!before) return;
    for (const [key, line] of current) {
      const delta = line.quantity - (before.get(key)?.quantity ?? 0);
      if (delta > 0) track({ type: "add_to_cart", productId: line.productId, quantity: delta, value: Math.round(delta * line.unitPrice * 100) / 100 });
      if (delta < 0) track({ type: "remove_from_cart", productId: line.productId, quantity: -delta });
    }
    for (const [key, line] of before) {
      if (!current.has(key)) track({ type: "remove_from_cart", productId: line.productId, quantity: line.quantity });
    }
  }, [lines, hasHydrated]);

  const showBanner = consent === null || reopened;
  if (consent === "unknown" || !showBanner) return null;

  const choose = (choice: ConsentChoice) => {
    setConsent(slug, choice);
    setReopened(false);
  };

  return (
    <section className="cookie-banner" aria-labelledby="cookie-banner-title" role="region">
      <h2 id="cookie-banner-title" className="cookie-banner__title">
        Cookies on {storeName}
      </h2>
      <p>
        We use essential cookies to run this shop, such as remembering your basket. With your permission, we&rsquo;d also like to use analytics
        cookies to understand how visitors use the shop, so we can improve it. We never sell your information.
        {privacyHref ? (
          <>
            {" "}
            <Link href={privacyHref}>Read our privacy policy</Link>.
          </>
        ) : null}
      </p>
      <div className="cookie-banner__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => choose("accepted")}>
          Accept analytics cookies
        </button>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => choose("rejected")}>
          Reject analytics cookies
        </button>
      </div>
    </section>
  );
}

/** "Cookie settings" in the footer, to change the choice later. */
export function CookieSettingsButton() {
  return (
    <button type="button" className="cookie-settings-link" onClick={reopenCookieSettings}>
      Cookie settings
    </button>
  );
}

/** Records a product view (on the product page). */
export function TrackProductView({ productId }: { productId: string }) {
  useEffect(() => {
    track({ type: "product_view", productId });
  }, [productId]);
  return null;
}
