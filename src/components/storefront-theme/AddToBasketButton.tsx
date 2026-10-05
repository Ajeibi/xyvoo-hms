"use client";

import { useState } from "react";
import { useCartStore } from "@/components/shop/CartProvider";
import type { ShopProduct } from "@/lib/shop/products";
import { announce } from "./StorefrontProvider";
import { Icon } from "./primitives";

export type BasketProduct = Pick<
  ShopProduct,
  "id" | "name" | "price" | "currency" | "imageUrl" | "stock" | "allowBackorder" | "minimumOrderQty"
>;

/** Quick add from a product card, for products without options to choose. */
export default function AddToBasketButton({ product, variant }: { product: BasketProduct; variant: "text" | "icon" }) {
  const addLine = useCartStore((s) => s.addLine);
  const [added, setAdded] = useState(false);
  const inStock = product.allowBackorder || product.stock > 0;

  const add = () => {
    addLine({
      productId: product.id,
      variantId: null,
      name: product.name,
      variantLabel: null,
      imageUrl: product.imageUrl,
      unitPrice: product.price,
      currency: product.currency,
      quantity: Math.max(1, product.minimumOrderQty || 1),
      maxQuantity: product.allowBackorder ? 999 : Math.max(product.stock, 0),
    });
    setAdded(true);
    announce(`${product.name} added to your basket.`);
    window.setTimeout(() => setAdded(false), 2000);
  };

  if (variant === "icon") {
    return (
      <button
        className="icon-btn"
        type="button"
        onClick={add}
        disabled={!inStock}
        aria-label={inStock ? `Add ${product.name} to basket` : `${product.name} is out of stock`}
      >
        <Icon name={added ? "check" : "bag"} />
      </button>
    );
  }

  return (
    <button className="btn btn--soft" type="button" onClick={add} disabled={!inStock}>
      {!inStock ? "Out of stock" : added ? "Added" : "Add to basket"}
      <span className="visually-hidden">: {product.name}</span>
    </button>
  );
}
