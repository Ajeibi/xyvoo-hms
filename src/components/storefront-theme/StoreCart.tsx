"use client";

import { useRef } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import { calculateCartTotals, cartLineKey } from "@/lib/shop/cart";
import { STORE_PATHS } from "@/lib/store/site/links";
import { announce, useMoney, useStorefront } from "./StorefrontProvider";
import ChargeNote from "./ChargeNote";
import { useBasketPrices } from "./useBasketPrices";
import { Breadcrumb, Icon, StoreImage } from "./primitives";

export default function StoreCart() {
  const { slug, href } = useStorefront();
  // Today's prices: a sale may have started or ended since things were added.
  const { pricesChanged } = useBasketPrices(slug);
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const emptyHeading = useRef<HTMLHeadingElement>(null);
  const money = useMoney();
  const { subtotal: homeSubtotal, itemCount } = calculateCartTotals(lines);
  const subtotal = money.subtotal(lines);

  const remove = (
    productId: string,
    variantId: string | null,
    name: string,
  ) => {
    removeLine(productId, variantId);
    announce(`${name} removed from your basket.`);
    if (lines.length === 1)
      window.setTimeout(() => emptyHeading.current?.focus(), 0);
  };

  return (
    <div className="container section">
      <Breadcrumb
        items={[{ label: "Home", href: href("/") }, { label: "Basket" }]}
      />
      <h1 className="h-page cart-title">Your basket</h1>

      {!hasHydrated ? (
        <p className="body-copy" role="status">
          Loading your basket…
        </p>
      ) : lines.length === 0 ? (
        <div className="cart-empty">
          <Icon name="bag" />
          <h2 className="h-section" tabIndex={-1} ref={emptyHeading}>
            Your basket is empty
          </h2>
          <p className="body-copy">
            Have a look around. Anything you add will be saved here.
          </p>
          <Link className="btn btn--primary" href={href(STORE_PATHS.products)}>
            Start shopping
          </Link>
        </div>
      ) : (
        <>
          {pricesChanged ? (
            <p className="price-change" role="status">
              Some prices have changed since you added them to your basket. Your
              basket shows today&rsquo;s prices.
            </p>
          ) : null}
          <div className="cart-layout">
            <section aria-labelledby="items-title">
              <h2 className="visually-hidden" id="items-title">
                Items in your basket
              </h2>
              <ul className="cart-lines">
                {lines.map((line, i) => {
                  const key = cartLineKey(line.productId, line.variantId);
                  const qtyId = `qty-${i}`;
                  return (
                    <li className="cart-line" key={key}>
                      <div className="media tone-6" aria-hidden="true">
                        {line.imageUrl ? (
                          <StoreImage
                            src={line.imageUrl}
                            alt=""
                            sizes="120px"
                          />
                        ) : null}
                      </div>
                      <div>
                        <div className="cart-line__top">
                          <div>
                            <h3 className="cart-line__title">{line.name}</h3>
                            {line.variantLabel ? (
                              <p className="cart-line__meta">
                                {line.variantLabel}
                              </p>
                            ) : null}
                            <p className="cart-line__meta">
                              {money.format(money.lineUnit(line))} each
                            </p>
                          </div>
                          <p className="cart-line__price">
                            {money.format(money.lineUnit(line) * line.quantity)}
                          </p>
                        </div>
                        <div className="cart-line__actions">
                          <div className="qty qty--sm">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${line.name}`}
                              disabled={line.quantity <= 1}
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
                            <label className="visually-hidden" htmlFor={qtyId}>
                              Quantity of {line.name}
                            </label>
                            <input
                              id={qtyId}
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={line.maxQuantity}
                              value={line.quantity}
                              onChange={(e) => {
                                const n = Number.parseInt(e.target.value, 10);
                                if (Number.isFinite(n) && n >= 1)
                                  updateQuantity(
                                    line.productId,
                                    line.variantId,
                                    Math.min(n, line.maxQuantity),
                                  );
                              }}
                            />
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
                          <button
                            className="link-btn"
                            type="button"
                            onClick={() =>
                              remove(line.productId, line.variantId, line.name)
                            }
                          >
                            Remove
                            <span className="visually-hidden">
                              {" "}
                              {line.name}
                            </span>
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Link className="link-arrow" href={href(STORE_PATHS.products)}>
                <Icon name="chevron-left" size="sm" />
                Continue shopping
              </Link>
            </section>

            <aside className="summary" aria-labelledby="summary-title">
              <h2 id="summary-title">Order summary</h2>
              <dl>
                <dt>
                  Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})
                </dt>
                <dd>{money.format(subtotal)}</dd>
                <dt className="total">Total</dt>
                <dd className="total">{money.format(subtotal)}</dd>
              </dl>
              <ChargeNote homeAmount={homeSubtotal} />
              <Link
                className="btn btn--primary"
                href={href(STORE_PATHS.checkout)}
              >
                <Icon name="lock" size="sm" />
                Checkout securely
              </Link>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
