"use client";

import { openBasketDrawer } from "@/lib/shop/basket-code";
import { useState } from "react";
import { useCartStore } from "@/components/shop/CartProvider";
import type { ShopProduct } from "@/lib/shop/products";
import { fixedLinePrices } from "@/lib/shop/cart";
import type { MessageKey } from "@/lib/store/i18n/messages";
import type { MessageVars } from "@/lib/store/i18n/translate";
import { announce, useT } from "./StorefrontProvider";
import { Icon } from "./primitives";

export type BasketProduct = Pick<
  ShopProduct,
  "id" | "name" | "price" | "currency" | "fixedPrices" | "deliveryExtra" | "imageUrl" | "stock" | "allowBackorder" | "minimumOrderQty"
>;

/** Quick add from a product card, for products without options to choose. */
export default function AddToBasketButton({ product, variant }: { product: BasketProduct; variant: "text" | "icon" }) {
  const t = useT();
  const addLine = useCartStore((s) => s.addLine);
  const [added, setAdded] = useState(false);
  // Enough left for the shop's minimum order (one, for most products).
  const inStock = product.allowBackorder || product.stock >= Math.max(1, product.minimumOrderQty || 1);

  const add = () => {
    addLine({
      productId: product.id,
      variantId: null,
      name: product.name,
      variantLabel: null,
      imageUrl: product.imageUrl,
      unitPrice: product.price,
      currency: product.currency,
      fixedPrices: fixedLinePrices(product.fixedPrices),
      deliveryExtra: product.deliveryExtra || undefined,
      quantity: Math.max(1, product.minimumOrderQty || 1),
      maxQuantity: product.allowBackorder ? 999 : Math.max(product.stock, 0),
      minQuantity: Math.max(1, product.minimumOrderQty || 1),
    });
    setAdded(true);
    announce(t("product.addedToBasket", { name: product.name }));
    openBasketDrawer(product.name);
    window.setTimeout(() => setAdded(false), 2000);
  };

  if (variant === "icon") {
    return (
      <button
        className="icon-btn"
        type="button"
        onClick={add}
        disabled={!inStock}
        aria-label={inStock ? t("product.addNamedToBasket", { name: product.name }) : t("product.namedOutOfStock", { name: product.name })}
      >
        <Icon name={added ? "check" : "bag"} />
      </button>
    );
  }

  return (
    <button className="btn btn--soft" type="button" onClick={add} disabled={!inStock}>
      {!inStock ? t("product.outOfStock") : added ? t("product.added") : t("product.addToBasket")}
      <span className="visually-hidden">: {product.name}</span>
    </button>
  );
}

/**
 * The shop's words for a server component that can't read the shopper's
 * language itself (the product card is rendered on the server, outside the
 * client context): <CardText k="product.viewProduct" />.
 */
export function CardText({ k, vars }: { k: MessageKey; vars?: MessageVars }) {
  const t = useT();
  return <>{t(k, vars)}</>;
}
