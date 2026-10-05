"use client";

import Link from "next/link";
import { STORE_PATHS } from "@/lib/store/site/links";
import { useStorefront } from "./StorefrontProvider";

/** Rendered inside the store's own layout, so a missing product still shows the store's header and footer. */
export default function StoreNotFound() {
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
