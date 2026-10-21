"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import { calculateCartTotals, fixedLinePrices, type CartLine } from "@/lib/shop/cart";
import { getBasketCode, setBasketCode } from "@/lib/shop/basket-code";
import type { FixedPrices } from "@/lib/store/currencies";
import { STORE_PATHS } from "@/lib/store/site/links";
import { announce, useMoney, useStorefront } from "./StorefrontProvider";
import { Icon, Price, StoreImage } from "./primitives";

type DeliverySummary = { deliveryFrom: number | null; eta: string | null; pickup: boolean; freeOver: number | null };

/** Read once per page load and shared by the basket page and the drawer. */
const summaries = new Map<string, Promise<DeliverySummary | null>>();
export function deliverySummary(slug: string) {
  if (!summaries.has(slug)) {
    summaries.set(
      slug,
      fetch(`/api/shop/${encodeURIComponent(slug)}/delivery-summary`)
        .then((r) => (r.ok ? (r.json() as Promise<DeliverySummary>) : null))
        .catch(() => null),
    );
  }
  return summaries.get(slug)!;
}

/** "Delivery from ₦2,000" and, when the shop delivers free over an amount, how close the basket is. */
export function DeliveryNote() {
  const { slug } = useStorefront();
  const money = useMoney();
  const lines = useCartStore((s) => s.lines);
  const [summary, setSummary] = useState<DeliverySummary | null>(null);
  useEffect(() => {
    let live = true;
    void deliverySummary(slug).then((s) => live && setSummary(s));
    return () => {
      live = false;
    };
  }, [slug]);
  if (!summary) return <p className="hint">Delivery is worked out at checkout from your address.</p>;

  const { subtotal } = calculateCartTotals(lines);
  const left = summary.freeOver != null ? Math.max(summary.freeOver - subtotal, 0) : null;
  const progress = summary.freeOver ? Math.min(100, Math.round((subtotal / summary.freeOver) * 100)) : 0;
  return (
    <div className="delivery-note">
      {left != null ? (
        left > 0 ? (
          <>
            <p>
              <Icon name="truck" size="sm" /> Spend <strong>{money.format(money.convert(left))}</strong> more for free delivery.
            </p>
            <div className="delivery-note__bar" role="progressbar" aria-label="Towards free delivery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <p>
            <Icon name="truck" size="sm" /> <strong>Your order delivers free.</strong>
          </p>
        )
      ) : null}
      {left !== 0 && summary.deliveryFrom != null ? (
        <p className="hint">
          {summary.deliveryFrom === 0 ? "Free delivery" : `Delivery from ${money.format(money.convert(summary.deliveryFrom))}`}
          {summary.eta ? `, ${summary.eta}` : ""}
          {summary.pickup ? ", or collect it yourself" : ""}. The exact charge is worked out at checkout.
        </p>
      ) : summary.pickup && summary.deliveryFrom == null ? (
        <p className="hint">Collect your order from the shop. Details at checkout.</p>
      ) : null}
    </div>
  );
}

type Applied = { code: string; amount: number; description: string; freeDelivery: boolean };

/**
 * A discount code in the basket: checked with the shop straight away (and
 * again whenever the basket changes), shown as a saving, and kept for
 * checkout, which applies it again.
 */
export function BasketDiscount({ onApplied }: { onApplied?: (applied: Applied | null) => void }) {
  const { slug } = useStorefront();
  const money = useMoney();
  const id = useId();
  const lines = useCartStore((s) => s.lines);
  const [input, setInput] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const basketKey = lines.map((l) => `${l.productId}:${l.variantId ?? ""}x${l.quantity}`).join(",");

  const check = async (code: string, quiet = false) => {
    if (!lines.length) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApplied(null);
        onApplied?.(null);
        setBasketCode(slug, null);
        setMessage(typeof data.error === "string" ? data.error : "We couldn't check that code. Please try again.");
        return;
      }
      const next = { code: data.code, amount: Number(data.amount) || 0, description: data.description, freeDelivery: Boolean(data.freeDelivery) };
      setApplied(next);
      onApplied?.(next);
      setBasketCode(slug, next.code);
      setInput("");
      if (!quiet) {
        const text = `Code ${next.code} applied: ${next.description}.`;
        setMessage(text);
        announce(text);
      }
    } catch {
      setMessage("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // A code kept from before (or the basket changed): check it again for what's in the basket now.
  useEffect(() => {
    const kept = getBasketCode(slug);
    if (!kept || !lines.length) return;
    const timer = window.setTimeout(() => void check(kept, true), 400);
    return () => window.clearTimeout(timer);
    // Only when what's in the basket changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basketKey, slug]);

  const remove = () => {
    setApplied(null);
    onApplied?.(null);
    setBasketCode(slug, null);
    setMessage("Discount code removed.");
    announce("Discount code removed.");
  };

  return (
    <div className="discount-code">
      {applied ? (
        <p className="discount-code__applied">
          <Icon name="check" size="sm" /> <strong>{applied.code}</strong> {applied.description}
          {applied.amount > 0 ? ` (you save ${money.format(money.convert(applied.amount))})` : ""}{" "}
          <button type="button" className="link-button" onClick={remove}>
            Remove<span className="visually-hidden"> discount code {applied.code}</span>
          </button>
        </p>
      ) : (
        <>
          <label htmlFor={`${id}-code`}>
            Discount code <span className="optional">(optional)</span>
          </label>
          <div className="discount-code__row">
            <input
              className="input"
              id={`${id}-code`}
              value={input}
              autoComplete="off"
              maxLength={40}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (input.trim()) void check(input.trim());
                }
              }}
              aria-describedby={`${id}-status`}
            />
            <button className="btn btn--outline" type="button" disabled={busy} onClick={() => (input.trim() ? void check(input.trim()) : setMessage("Enter a discount code."))}>
              {busy ? "Checking…" : "Apply"}
            </button>
          </div>
        </>
      )}
      <p className="hint" id={`${id}-status`} role="status">
        {message}
      </p>
    </div>
  );
}

type Suggestion = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string;
  price: number;
  compareAt: number | null;
  fixedPrices: FixedPrices;
  currency: string;
  needsOptions: boolean;
  stock: number;
  allowBackorder: boolean;
  minimumOrderQty: number;
  deliveryExtra: number;
};

/** "You might also like": the merchant's pairings for what's in the basket, then similar products. */
export function BasketSuggestions({ heading = "You might also like" }: { heading?: string }) {
  const { slug, href } = useStorefront();
  const lines = useCartStore((s) => s.lines);
  const addLine = useCartStore((s) => s.addLine);
  const [items, setItems] = useState<Suggestion[]>([]);
  const ids = [...new Set(lines.map((l) => l.productId))].sort().join(",");
  const titleId = useId();

  useEffect(() => {
    let live = true;
    fetch(`/api/shop/${encodeURIComponent(slug)}/basket/suggestions?ids=${encodeURIComponent(ids)}`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((data: { products: Suggestion[] }) => live && setItems(data.products))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [slug, ids]);

  if (!items.length) return null;
  const add = (p: Suggestion) => {
    const line: CartLine = {
      productId: p.id,
      variantId: null,
      name: p.name,
      variantLabel: null,
      imageUrl: p.imageUrl,
      unitPrice: p.price,
      currency: p.currency,
      fixedPrices: fixedLinePrices(p.fixedPrices),
      deliveryExtra: p.deliveryExtra || undefined,
      quantity: Math.max(1, p.minimumOrderQty || 1),
      maxQuantity: p.allowBackorder ? 999 : Math.max(p.stock, 0),
      minQuantity: Math.max(1, p.minimumOrderQty || 1),
    };
    addLine(line);
    announce(`${p.name} added to your basket.`);
  };

  return (
    <section className="basket-suggestions" aria-labelledby={titleId}>
      <h2 className="basket-suggestions__title" id={titleId}>
        {heading}
      </h2>
      <ul>
        {items.map((p) => (
          <li key={p.id} className="basket-suggestion">
            <Link className="media basket-suggestion__media" href={href(STORE_PATHS.product(p.slug))} tabIndex={-1} aria-hidden="true">
              {p.imageUrl ? <StoreImage src={p.imageUrl} alt="" sizes="72px" /> : null}
            </Link>
            <div className="basket-suggestion__text">
              <Link href={href(STORE_PATHS.product(p.slug))} className="basket-suggestion__name">
                {p.name}
              </Link>
              <span className="basket-suggestion__price">
                <Price amount={p.price} compareAt={p.compareAt} fixedPrices={p.fixedPrices} />
              </span>
            </div>
            {p.needsOptions ? (
              <Link className="btn btn--outline btn--sm" href={href(STORE_PATHS.product(p.slug))}>
                Choose<span className="visually-hidden"> options for {p.name}</span>
              </Link>
            ) : (
              <button className="btn btn--outline btn--sm" type="button" onClick={() => add(p)}>
                Add<span className="visually-hidden"> {p.name} to your basket</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
