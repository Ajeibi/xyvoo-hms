"use client";

import { useEffect } from "react";
import { encodeStoredReferral, referralFromSearch, referralStorageKey } from "@/lib/store/referral-link";
import { useStorefront } from "./StorefrontProvider";

/**
 * Keeps a friend's code from a link (?ref=FRIEND-…) so checkout can fill it in.
 * Renders nothing. A later link replaces an earlier one.
 */
export default function ReferralCapture() {
  const { slug } = useStorefront();
  useEffect(() => {
    if (window.self !== window.top) return; // the website editor's preview
    const code = referralFromSearch(window.location.search);
    if (!code) return;
    try {
      localStorage.setItem(referralStorageKey(slug), encodeStoredReferral(code));
    } catch {
      // Private browsing: the friend can still type the code at checkout.
    }
  }, [slug]);
  return null;
}
