"use client";

import { useEffect, useState } from "react";
import { FiShare2 } from "react-icons/fi";
import { deliverySummary } from "./BasketExtras";
import { announce, useMoney, useStorefront } from "./StorefrontProvider";
import { Icon } from "./primitives";

/** Share the product: the phone's own share sheet where there is one, else copy the link. */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href.split("#")[0];
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      announce("Link copied.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // The shopper closed the share sheet, or the browser wouldn't copy: nothing to do.
    }
  };
  return (
    <button className="link-btn share-btn" type="button" onClick={share}>
      <FiShare2 aria-hidden className="icon icon--sm" /> {copied ? "Link copied" : "Share"}
    </button>
  );
}

/** "Delivery from ₦2,500, 1 to 2 business days. Free delivery on orders over ₦100,000." */
export function ProductDelivery() {
  const { slug } = useStorefront();
  const money = useMoney();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof deliverySummary>>>(null);
  useEffect(() => {
    let live = true;
    void deliverySummary(slug).then((s) => live && setSummary(s));
    return () => {
      live = false;
    };
  }, [slug]);
  if (!summary || (summary.deliveryFrom == null && !summary.pickup)) return null;
  return (
    <ul className="pdp-delivery">
      {summary.deliveryFrom != null ? (
        <li>
          <Icon name="truck" size="sm" />
          <span>
            {summary.deliveryFrom === 0 ? "Free delivery" : `Delivery from ${money.format(money.convert(summary.deliveryFrom))}`}
            {summary.eta ? `, ${summary.eta}` : ""}.{summary.freeOver != null ? ` Free delivery on orders over ${money.format(money.convert(summary.freeOver))}.` : ""}
          </span>
        </li>
      ) : null}
      {summary.pickup ? (
        <li>
          <Icon name="pin" size="sm" />
          <span>Or collect it from the shop.</span>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * On phones, once the buy buttons have scrolled out of view: a bar at the
 * bottom with the price and "Add to basket", so it's always a tap away.
 * `watch` is the id of the element whose visibility decides it.
 */
export function StickyBuyBar({ watch, name, price, label, disabled, onAdd }: { watch: string; name: string; price: React.ReactNode; label: string; disabled: boolean; onAdd: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = document.getElementById(watch);
    if (!target || !("IntersectionObserver" in window)) return;
    // Shown only once the buttons have gone off the top of the screen, not before the shopper reaches them.
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(target);
    return () => observer.disconnect();
  }, [watch]);
  return (
    <div className={`sticky-buy${visible ? " is-visible" : ""}`} aria-hidden={!visible} inert={!visible}>
      <div className="sticky-buy__text">
        <span className="sticky-buy__name">{name}</span>
        <span className="sticky-buy__price">{price}</span>
      </div>
      <button className="btn btn--primary" type="button" disabled={disabled} onClick={onAdd}>
        {label}
      </button>
    </div>
  );
}
