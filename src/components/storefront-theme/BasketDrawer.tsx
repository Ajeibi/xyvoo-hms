"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/components/shop/CartProvider";
import { calculateCartTotals, cartLineKey } from "@/lib/shop/cart";
import { STORE_PATHS } from "@/lib/store/site/links";
import { BasketSuggestions, DeliveryNote } from "./BasketExtras";
import ChargeNote from "./ChargeNote";
import { announce, useMoney, useStorefront, useT } from "./StorefrontProvider";
import { useBasketPrices } from "./useBasketPrices";
import { Icon, StoreImage } from "./primitives";

/** What a basket line's problem means for the shopper: t(PROBLEM_TEXT[line.problem]). */
export const PROBLEM_TEXT = {
  unavailable: "checkout.problemUnavailable",
  "sold-out": "checkout.problemSoldOut",
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
  const t = useT();
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
              {itemCount ? t("checkout.basketTitleCount", { count: itemCount }) : t("checkout.basketTitle")}
            </h2>
            <button
              className="icon-btn"
              type="button"
              aria-label={t("checkout.closeBasket")}
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
            </button>
          </header>
          {added ? (
            <p className="basket-drawer__added" role="status">
              <Icon name="check-circle" size="sm" /> {t("checkout.addedToBasket", { name: added })}
            </p>
          ) : null}

          {lines.length === 0 ? (
            <div className="basket-drawer__empty">
              <p className="body-copy">{t("checkout.basketEmptyShort")}</p>
              <Link
                className="btn btn--primary"
                href={href(STORE_PATHS.products)}
              >
                {t("checkout.startShopping")}
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
                          {t(PROBLEM_TEXT[line.problem])}
                        </p>
                      ) : null}
                      <div className="mini-cart-line__actions">
                        {line.problem ? null : (
                          <div className="qty qty--sm">
                            <button
                              type="button"
                              aria-label={t("checkout.decreaseQuantity", { name: line.name })}
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
                              <span className="visually-hidden">{t("checkout.quantity")} </span>
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={t("checkout.increaseQuantity", { name: line.name })}
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
                            announce(t("checkout.removedFromBasket", { name: line.name }));
                          }}
                        >
                          {t("common.remove")}
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
                  <dt>{t("checkout.subtotal")}</dt>
                  <dd>{money.format(money.subtotal(lines))}</dd>
                </dl>
                <ChargeNote homeAmount={homeSubtotal} />
                {blocked ? (
                  <p className="mini-cart-line__problem" role="status">
                    {t("checkout.drawerBlocked")}
                  </p>
                ) : (
                  <Link
                    className="btn btn--primary"
                    href={href(STORE_PATHS.checkout)}
                  >
                    <Icon name="lock" size="sm" /> {t("checkout.checkoutSecurely")}
                  </Link>
                )}
                <Link
                  className="btn btn--outline"
                  href={href(STORE_PATHS.cart)}
                >
                  {t("checkout.viewBasket")}
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
