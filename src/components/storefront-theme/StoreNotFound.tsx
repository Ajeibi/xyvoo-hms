"use client";

import Link from "next/link";
import { STORE_PATHS } from "@/lib/store/site/links";
import { STOREFRONT_ROOT_DOMAIN } from "@/lib/store/subdomain";
import { useHasStorefront, useStorefront } from "./StorefrontProvider";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || `https://${STOREFRONT_ROOT_DOMAIN}`;

/**
 * Rendered inside the store's own layout, so a missing product still shows the
 * store's header and footer. When no shop uses the address at all, the layout
 * has no store to show, so this says that instead, branded as XYVOO.
 */
export default function StoreNotFound() {
  return useHasStorefront() ? <MissingStorePage /> : <UnknownStore />;
}

function MissingStorePage() {
  const { href } = useStorefront();
  return (
    <div className="container section cart-empty">
      <h1 className="h-page">We can&rsquo;t find that page</h1>
      <p className="body-copy">It may have moved, or the product may no longer be available.</p>
      <div className="stack">
        <Link className="btn btn--primary" href={href(STORE_PATHS.products)}>
          Browse all products
        </Link>
        <Link className="link-arrow" href={href("/")}>
          Go to the home page
        </Link>
      </div>
    </div>
  );
}

function UnknownStore() {
  return (
    <main id="main" className="unknown-store">
      <div>
        <p className="unknown-store__eyebrow">Shop not found</p>
        <h1>There&rsquo;s no shop at this address</h1>
        <p>Please check the web address for typing mistakes. If you followed a link, the shop may have changed its address or closed.</p>
        <div className="unknown-store__actions">
          <a className="unknown-store__primary" href={APP_URL}>
            Go to XYVOO
          </a>
          <a className="unknown-store__secondary" href={`${APP_URL}/register/storefront`}>
            Open your own shop
          </a>
        </div>
      </div>
    </main>
  );
}
