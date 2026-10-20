"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/components/shop/CartProvider";
import { cartLineKey } from "@/lib/shop/cart";
import { useStorefront } from "./StorefrontProvider";
import { sendAccountActivity, useShopAccount } from "./useShopAccount";
import { getConsent, initStoreAnalytics, onConsentChange, reopenCookieSettings, setConsent, track, type ConsentChoice } from "@/lib/store/analytics-client";
import { configurePixels, loadPixels, pixelPurchase, stopPixels, type PurchaseLine } from "@/lib/store/ad-pixels";

/*
 * The store's cookie banner and automatic tracking: page views, searches and
 * basket changes. Tracking only starts once the visitor accepts analytics
 * cookies, and "Reject" is as easy as "Accept". The same choice covers the shop
 * owner's own Meta Pixel and Google Analytics, when they've added them. The banner is fixed to the
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

export type ShopPixels = { metaPixelId: string | null; googleAnalyticsId: string | null };

export default function StoreAnalytics({ slug, storeName, privacyHref, pixels }: { slug: string; storeName: string; privacyHref: string | null; pixels: ShopPixels }) {
  const consent = useConsent(slug);
  const { currency } = useStorefront();
  const [reopened, setReopened] = useState(false);
  const pathname = usePathname();
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const previousLines = useRef<Map<string, { quantity: number; unitPrice: number; productId: string; itemId: string }> | null>(null);
  const { metaPixelId, googleAnalyticsId } = pixels;
  const partners = [metaPixelId ? "Meta" : null, googleAnalyticsId ? "Google" : null].filter(Boolean).join(" and ");

  useEffect(() => {
    // Pixels first, so events held from before the tracker started reach them too.
    configurePixels({ metaPixelId, googleAnalyticsId, currency });
    if (getConsent(slug) === "accepted") loadPixels();
    initStoreAnalytics(slug);
    const open = () => setReopened(true);
    window.addEventListener("sf:cookie-settings", open);
    return () => window.removeEventListener("sf:cookie-settings", open);
  }, [slug, metaPixelId, googleAnalyticsId, currency]);

  // Accepting loads the pixels; turning cookies down stops them and clears their cookies.
  useEffect(() => {
    if (consent === "accepted") loadPixels();
    if (consent === "rejected") stopPixels();
  }, [consent]);

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
    const current = new Map(
      lines.map((l) => [cartLineKey(l.productId, l.variantId), { quantity: l.quantity, unitPrice: l.unitPrice, productId: l.productId, itemId: l.variantId ?? l.productId }]),
    );
    const before = previousLines.current;
    previousLines.current = current;
    if (!before) return;
    for (const [key, line] of current) {
      const delta = line.quantity - (before.get(key)?.quantity ?? 0);
      if (delta > 0) track({ type: "add_to_cart", productId: line.productId, quantity: delta, value: Math.round(delta * line.unitPrice * 100) / 100, itemIds: [line.itemId] });
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
        cookies to understand how visitors use the shop, so we can improve it.
        {partners ? ` These include cookies from ${partners}, which help us measure and improve our adverts.` : ""} We never sell your information.
        {privacyHref ? (
          <>
            {" "}
            <Link href={privacyHref}>Read our privacy policy</Link>.
          </>
        ) : null}
      </p>
      <div className="cookie-banner__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => choose("accepted")}>
          {partners ? "Accept analytics and advert cookies" : "Accept analytics cookies"}
        </button>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => choose("rejected")}>
          {partners ? "Reject analytics and advert cookies" : "Reject analytics cookies"}
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

/** Records a product view (on the product page): in analytics (with consent), and on a signed-in shopper's account. */
export function TrackProductView({ productId, itemIds, name, value }: { productId: string; itemIds: string[]; name: string; value: number }) {
  const { slug } = useStorefront();
  const { account } = useShopAccount();
  const signedIn = Boolean(account);
  const ids = itemIds.join(",");
  useEffect(() => {
    track({ type: "product_view", productId, itemIds: ids.split(","), itemName: name, value });
  }, [productId, ids, name, value]);
  useEffect(() => {
    if (signedIn) sendAccountActivity(slug, { productId });
  }, [productId, signedIn, slug]);
  return null;
}

/** Tells the shop's Meta Pixel and Google tag about a completed order (on the thank-you pages), once, with consent. */
export function TrackPurchase({ orderId, total, lines }: { orderId: string; total: number; lines: PurchaseLine[] }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    pixelPurchase({ id: orderId, total, lines });
  }, [orderId, total, lines]);
  return null;
}
