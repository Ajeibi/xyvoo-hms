"use client";

import { useEffect, useState } from "react";
import { countdownLabel } from "@/lib/store/discounts";
import { announce } from "./StorefrontProvider";

/**
 * The banner for a discount code that has its countdown switched on: what it
 * takes off, the code, and how long is left. The text starts as the server
 * worked it out, is refreshed every 30 seconds and the banner goes when the
 * code ends. The label is not a live region, so a screen reader is not
 * interrupted as the minutes change.
 */
export default function PromoBar({ offer, code, endsAt, initialLabel }: { offer: string; code: string; endsAt: string; initialLabel: string }) {
  const [label, setLabel] = useState<string | null>(initialLabel);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const update = () => setLabel(countdownLabel(endsAt, new Date()));
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  if (!label) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      announce(`Code ${code} copied`);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Copying is not available here; the code is still on the page to type.
    }
  };

  return (
    <aside className="promo-bar" aria-label="Offer">
      <div className="container promo-bar__inner">
        <p>
          {offer} with code <strong>{code}</strong>
          <span className="promo-bar__time"> · {label}</span>
        </p>
        <button type="button" className="promo-bar__copy" onClick={copy}>
          {copied ? "Copied" : "Copy code"}
          <span className="visually-hidden"> {code}</span>
        </button>
      </div>
    </aside>
  );
}
