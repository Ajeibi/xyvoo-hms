"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/components/shop/CartProvider";
import { calculateCartTotals, cartLineKey } from "@/lib/shop/cart";
import { STORE_PATHS } from "@/lib/store/site/links";
import { BasketSuggestions, DeliveryNote } from "./BasketExtras";
import ChargeNote from "./ChargeNote";
import { announce, useMoney, useStorefront } from "./StorefrontProvider";
import { useBasketPrices } from "./useBasketPrices";
import { Icon, StoreImage } from "./primitives";

/** What a basket line's problem means for the shopper. */
export const PROBLEM_TEXT = {
  unavailable: "No longer available. Remove it to check out.",
  "sold-out": "Sold out. Remove it to check out.",
} as const;

/**
 * The basket as a side panel, opened when something is added (or from the
 * header's basket button), so shoppers can carry on shopping or go straight to
 * checkout. A native modal <dialog>: focus stays inside, Escape closes it, and
 * focus goes back where it was.
 */
export default function BasketDrawer() {
  const { slug, href } = useStorefront();
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const lines = useCartStore((s) => s.lines);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const money = useMoney();
  // Today's prices and stock, while the panel is open.
  useBasketPrices(open ? slug : "");
  const { subtotal: homeSubtotal, itemCount } = calculateCartTotals(lines);
  const blocked = lines.some((l) => l.problem);

  useEffect(() => {
    const show = (e: Event) => {
      setAdded((e as CustomEvent<{ added?: string }>).detail?.added ?? null);
      setOpen(true);
    };
    window.addEventListener("sf:basket-open", show);
    return () => window.removeEventListener("sf:basket-open", show);
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Following a link inside the panel (checkout, a product) closes it.
  const [shownPath, setShownPath] = useState(pathname);
  if (pathname !== shownPath) {
    setShownPath(pathname);
    setOpen(false);
  }

  return (
    <dialog
      ref={dialog}
      className="basket-drawer"
      aria-labelledby="basket-drawer-title"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        // A click on the dimmed backdrop (the dialog itself, outside its panel) closes it.
        if (e.target === dialog.current) setOpen(false);
      }}
    >
      {/* Its contents (and their requests) only while it's open. */}
      {open ? (
        <div className="basket-drawer__panel">
          <header className="basket-drawer__head">
            <h2 id="basket-drawer-title" className="h-card">
              Your basket{itemCount ? ` (${itemCount})` : ""}
            </h2>
            <button
              className="icon-btn"
              type="button"
              aria-label="Close basket"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
            </button>
          </header>
          {added ? (
            <p className="basket-drawer__added" role="status">
              <Icon name="check-circle" size="sm" /> {added} added to your
              basket.
            </p>
          ) : null}

          {lines.length === 0 ? (
            <div className="basket-drawer__empty">
              <p className="body-copy">Your basket is empty.</p>
              <Link
                className="btn btn--primary"
                href={href(STORE_PATHS.products)}
              >
                Start shopping
              </Link>
            </div>
          ) : (
            <>
              <ul className="basket-drawer__lines">
                {lines.map((line) => (
                  <li
                    key={cartLineKey(line.productId, line.variantId)}
                    className={`mini-cart-line${line.problem ? " has-problem" : ""}`}
                  >
                    <span
                      className="media mini-cart-line__media"
                      aria-hidden="true"
                    >
                      {line.imageUrl ? (
                        <StoreImage src={line.imageUrl} alt="" sizes="64px" />
                      ) : null}
                    </span>
                    <div className="mini-cart-line__body">
                      <p className="mini-cart-line__name">{line.name}</p>
                      {line.variantLabel ? (
                        <p className="mini-cart-line__meta">
                          {line.variantLabel}
                        </p>
                      ) : null}
                      {line.problem ? (
                        <p className="mini-cart-line__problem">
                          {PROBLEM_TEXT[line.problem]}
                        </p>
                      ) : null}
                      <div className="mini-cart-line__actions">
                        {line.problem ? null : (
                          <div className="qty qty--sm">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${line.name}`}
                              disabled={
                                line.quantity <= (line.minQuantity ?? 1)
                              }
                              onClick={() =>
                                updateQuantity(
                                  line.productId,
                                  line.variantId,
                                  line.quantity - 1,
                                )
                              }
                            >
                              <Icon name="minus" />
                            </button>
                            <span className="qty__value" aria-live="polite">
                              <span className="visually-hidden">Quantity </span>
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`Increase quantity of ${line.name}`}
                              disabled={line.quantity >= line.maxQuantity}
                              onClick={() =>
                                updateQuantity(
                                  line.productId,
                                  line.variantId,
                                  line.quantity + 1,
                                )
                              }
                            >
                              <Icon name="plus" />
                            </button>
                          </div>
                        )}
                        <button
                          className="link-btn"
                          type="button"
                          onClick={() => {
                            removeLine(line.productId, line.variantId);
                            announce(`${line.name} removed from your basket.`);
                          }}
                        >
                          Remove
                          <span className="visually-hidden"> {line.name}</span>
                        </button>
                      </div>
                    </div>
                    <p className="mini-cart-line__price">
                      {money.format(money.lineUnit(line) * line.quantity)}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="basket-drawer__foot">
                <DeliveryNote />
                <dl className="basket-drawer__total">
                  <dt>Subtotal</dt>
                  <dd>{money.format(money.subtotal(lines))}</dd>
                </dl>
                <ChargeNote homeAmount={homeSubtotal} />
                {blocked ? (
                  <p className="mini-cart-line__problem" role="status">
                    Remove the items that can&rsquo;t be bought, then check out.
                  </p>
                ) : (
                  <Link
                    className="btn btn--primary"
                    href={href(STORE_PATHS.checkout)}
                  >
                    <Icon name="lock" size="sm" /> Checkout securely
                  </Link>
                )}
                <Link
                  className="btn btn--outline"
                  href={href(STORE_PATHS.cart)}
                >
                  View basket
                </Link>
              </div>
              <BasketSuggestions />
            </>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
