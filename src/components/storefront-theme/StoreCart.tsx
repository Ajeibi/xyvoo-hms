"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FaWhatsapp } from "react-icons/fa6";
import { useCartStore } from "@/components/shop/CartProvider";
import { calculateCartTotals, cartLineKey } from "@/lib/shop/cart";
import { STORE_PATHS } from "@/lib/store/site/links";
import { announce, useMoney, useStorefront, useT } from "./StorefrontProvider";
import ChargeNote from "./ChargeNote";
import { useBasketPrices } from "./useBasketPrices";
import { Breadcrumb, Icon, StoreImage } from "./primitives";
import { BasketDiscount, BasketSuggestions, DeliveryNote } from "./BasketExtras";
import { PROBLEM_TEXT } from "./BasketDrawer";

export default function StoreCart() {
  const { slug, href, whatsappOrdering } = useStorefront();
  // Today's prices: a sale may have started or ended since things were added.
  const { pricesChanged } = useBasketPrices(slug);
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const emptyHeading = useRef<HTMLHeadingElement>(null);
  const money = useMoney();
  const t = useT();
  const { subtotal: homeSubtotal, itemCount } = calculateCartTotals(lines);
  const subtotal = money.subtotal(lines);
  // A code applied in the basket: shown as a saving here, applied again at checkout.
  const [discount, setDiscount] = useState<{ code: string; amount: number } | null>(null);
  const blocked = lines.some((l) => l.problem);

  const remove = (
    productId: string,
    variantId: string | null,
    name: string,
  ) => {
    removeLine(productId, variantId);
    announce(t("checkout.removedFromBasket", { name }));
    if (lines.length === 1)
      window.setTimeout(() => emptyHeading.current?.focus(), 0);
  };

  return (
    <div className="container section">
      <Breadcrumb
        items={[{ label: t("common.home"), href: href("/") }, { label: t("checkout.basket") }]}
      />
      <h1 className="h-page cart-title">{t("checkout.basketTitle")}</h1>

      {!hasHydrated ? (
        <p className="body-copy" role="status">
          {t("checkout.loadingBasket")}
        </p>
      ) : lines.length === 0 ? (
        <div className="cart-empty">
          <Icon name="bag" />
          <h2 className="h-section" tabIndex={-1} ref={emptyHeading}>
            {t("checkout.basketEmpty")}
          </h2>
          <p className="body-copy">
            {t("checkout.basketEmptyText")}
          </p>
          <Link className="btn btn--primary" href={href(STORE_PATHS.products)}>
            {t("checkout.startShopping")}
          </Link>
        </div>
      ) : (
        <>
          {pricesChanged ? (
            <p className="price-change" role="status">
              {t("checkout.pricesChangedBasket")}
            </p>
          ) : null}
          <div className="cart-layout">
            <section aria-labelledby="items-title">
              <h2 className="visually-hidden" id="items-title">
                {t("checkout.itemsInBasket")}
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
                              {t("checkout.eachPrice", { price: money.format(money.lineUnit(line)) })}
                            </p>
                            {line.problem ? (
                              <p className="cart-line__problem">
                                <Icon name="close" size="sm" /> {t(PROBLEM_TEXT[line.problem])}
                              </p>
                            ) : null}
                          </div>
                          <p className="cart-line__price">
                            {money.format(money.lineUnit(line) * line.quantity)}
                          </p>
                        </div>
                        <div className="cart-line__actions">
                          <div className="qty qty--sm" hidden={Boolean(line.problem)}>
                            <button
                              type="button"
                              aria-label={t("checkout.decreaseQuantity", { name: line.name })}
                              disabled={line.quantity <= (line.minQuantity ?? 1)}
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
                              {t("checkout.quantityOf", { name: line.name })}
                            </label>
                            <input
                              id={qtyId}
                              type="number"
                              inputMode="numeric"
                              min={line.minQuantity ?? 1}
                              max={line.maxQuantity}
                              value={line.quantity}
                              aria-describedby={
                                (line.minQuantity ?? 1) > 1
                                  ? `${qtyId}-min`
                                  : undefined
                              }
                              onChange={(e) => {
                                const n = Number.parseInt(e.target.value, 10);
                                if (Number.isFinite(n) && n >= 1)
                                  updateQuantity(
                                    line.productId,
                                    line.variantId,
                                    Math.min(
                                      Math.max(n, line.minQuantity ?? 1),
                                      line.maxQuantity,
                                    ),
                                  );
                              }}
                            />
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
                          {(line.minQuantity ?? 1) > 1 ? (
                            <p className="hint" id={`${qtyId}-min`}>
                              {t("checkout.minimumOrder", { min: line.minQuantity ?? 1 })}
                            </p>
                          ) : null}
                          <button
                            className="link-btn"
                            type="button"
                            onClick={() =>
                              remove(line.productId, line.variantId, line.name)
                            }
                          >
                            {t("common.remove")}
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
                {t("checkout.continueShopping")}
              </Link>
              <BasketSuggestions />
            </section>

            <aside className="summary" aria-labelledby="summary-title">
              <h2 id="summary-title">{t("checkout.orderSummary")}</h2>
              <dl>
                <dt>
                  {t("checkout.subtotalItems", { count: itemCount })}
                </dt>
                <dd>{money.format(subtotal)}</dd>
                {discount && discount.amount > 0 ? (
                  <>
                    <dt>{t("checkout.discountWithCode", { code: discount.code })}</dt>
                    <dd>−{money.format(money.convert(discount.amount))}</dd>
                  </>
                ) : null}
                <dt className="total">{t("checkout.estimatedTotal")}</dt>
                <dd className="total">
                  {money.format(Math.max(subtotal - (discount ? money.convert(discount.amount) : 0), 0))}
                </dd>
              </dl>
              <BasketDiscount onApplied={(a) => setDiscount(a ? { code: a.code, amount: a.amount } : null)} />
              <DeliveryNote />
              <p className="hint">{t("checkout.deliveryTaxAtCheckout")}</p>
              <ChargeNote homeAmount={homeSubtotal} />
              {blocked ? (
                <p className="cart-line__problem" role="status">
                  {t("checkout.cartBlocked")}
                </p>
              ) : (
                <Link
                  className="btn btn--primary"
                  href={href(STORE_PATHS.checkout)}
                >
                  <Icon name="lock" size="sm" />
                  {t("checkout.checkoutSecurely")}
                </Link>
              )}
              {whatsappOrdering && !blocked ? (
                <>
                  {/* The same checkout with WhatsApp chosen, so the order is recorded before the chat opens. */}
                  <Link className="btn btn--whatsapp" href={`${href(STORE_PATHS.checkout)}?pay=whatsapp`} aria-describedby="cart-whatsapp-hint">
                    <FaWhatsapp aria-hidden />
                    {t("checkout.orderOnWhatsApp")}
                  </Link>
                  <p className="whatsapp-hint" id="cart-whatsapp-hint">
                    {t("checkout.whatsappHint")}
                  </p>
                </>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
