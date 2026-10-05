"use client";

import { useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/components/shop/CartProvider";
import type { ShopProduct, ShopProductVariant } from "@/lib/shop/products";
import { STORE_PATHS } from "@/lib/store/site/links";
import { announce, useStorefront } from "./StorefrontProvider";
import { Icon, Price, Rating, StoreImage } from "./primitives";

function findMatchingVariant(variants: ShopProductVariant[], selected: Record<string, string>) {
  return variants.find((v) => Object.entries(selected).every(([key, value]) => v.options[key] === value)) || null;
}

/** Whether any in-stock (or back-orderable) variant has this option value, given the other choices so far. */
function optionAvailable(product: ShopProduct, selected: Record<string, string>, name: string, value: string) {
  if (product.allowBackorder) return true;
  const wanted = { ...selected, [name]: value };
  return product.variants.some((v) => v.stock > 0 && Object.entries(wanted).every(([k, val]) => v.options[k] === val));
}

/** Gallery and buy box for the product page, in the templates' .pdp layout. */
export default function ProductDetail({ product, details }: { product: ShopProduct; details: React.ReactNode }) {
  const { href } = useStorefront();
  const addLine = useCartStore((s) => s.addLine);

  const images = product.imageUrls.length > 0 ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];
  const altFor = (i: number) => product.imageAltTexts[i] || `${product.name}, image ${i + 1} of ${images.length}`;
  const [activeImage, setActiveImage] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const minQty = Math.max(1, product.minimumOrderQty || 1);
  const [quantity, setQuantity] = useState(minQty);
  const [status, setStatus] = useState("");

  const hasVariants = product.productOptions.length > 0 && product.variants.length > 0;
  const allChosen = product.productOptions.every((opt) => selected[opt.name]);
  const variant = hasVariants && allChosen ? findMatchingVariant(product.variants, selected) : null;
  const price = variant?.priceOverride ?? product.price;
  const stock = variant ? variant.stock : product.stock;
  const inStock = product.allowBackorder || (hasVariants && !allChosen ? product.inStock : stock > 0);
  const maxQty = product.allowBackorder ? 99 : Math.max(stock, 0);
  const shownImage = variant?.imageUrl || images[activeImage] || null;

  const stockText = !inStock
    ? "Out of stock"
    : product.preorder
      ? "Available to pre-order"
      : !product.allowBackorder && stock > 0 && stock <= 5 && (!hasVariants || allChosen)
        ? `Only ${stock} left in stock`
        : "In stock";

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasVariants && !allChosen) {
      setStatus("Please choose " + product.productOptions.filter((o) => !selected[o.name]).map((o) => o.name.toLowerCase()).join(" and ") + ".");
      return;
    }
    if (hasVariants && !variant) {
      setStatus("That combination isn't available. Please choose another.");
      return;
    }
    addLine({
      productId: product.id,
      variantId: variant?.id || null,
      name: product.name,
      variantLabel: variant ? Object.values(variant.options).join(" · ") : null,
      imageUrl: variant?.imageUrl || product.imageUrl,
      unitPrice: price,
      currency: product.currency,
      quantity,
      maxQuantity: maxQty,
    });
    const message = `${product.name} added to your basket.`;
    setStatus(message);
    announce(message);
  };

  return (
    <div className="pdp">
      <div className="pdp__gallery">
        <div className="media gallery-main tone-4">
          {shownImage ? (
            <StoreImage src={shownImage} alt={altFor(activeImage)} sizes="(min-width: 900px) 50vw, 100vw" priority />
          ) : (
            <span className="media__label" aria-hidden="true">
              <Icon name="image" />
              No photo yet
            </span>
          )}
        </div>
        {images.length > 1 ? (
          <ul className="thumbs" aria-label="Product images">
            {images.map((src, i) => (
              <li key={src + i}>
                <button
                  className="thumb"
                  type="button"
                  aria-pressed={i === activeImage}
                  aria-label={`Show image ${i + 1} of ${images.length}`}
                  onClick={() => setActiveImage(i)}
                >
                  <span className="media" aria-hidden="true">
                    <StoreImage src={src} alt="" sizes="96px" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="pdp__info">
        <div className="pdp__head">
          {product.category ? <p className="eyebrow">{[product.category, product.subcategory].filter(Boolean).join(" · ")}</p> : null}
          <h1 className="h-page">{product.name}</h1>
          {product.ratingCount > 0 ? (
            <a href="#reviews" className="rating-link">
              <Rating value={product.ratingAverage} count={product.ratingCount} />
            </a>
          ) : null}
          <p className="pdp__price">
            <Price amount={price} compareAt={variant ? null : product.compareAtPrice} currency={product.currency} />
          </p>
        </div>
        {product.shortDescription ? <p className="body-copy">{product.shortDescription}</p> : null}

        <form className="stack" onSubmit={add} noValidate>
          {hasVariants
            ? product.productOptions.map((option) => (
                <fieldset className="option-group" key={option.name}>
                  <legend>
                    {option.name}: <span>{selected[option.name] || "choose one"}</span>
                  </legend>
                  <div className="pills">
                    {option.values.map((value) => {
                      const available = optionAvailable(product, selected, option.name, value);
                      return (
                        <label className="pill" key={value}>
                          <input
                            type="radio"
                            name={option.name}
                            value={value}
                            checked={selected[option.name] === value}
                            disabled={!available}
                            onChange={() => {
                              setSelected((prev) => ({ ...prev, [option.name]: value }));
                              setStatus("");
                            }}
                          />
                          <span>
                            {value}
                            {!available ? <span className="visually-hidden"> (out of stock)</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))
            : null}

          <p className="stock">{stockText}</p>

          <div className="buy-row">
            <div className="qty">
              <button type="button" aria-label="Decrease quantity" disabled={quantity <= minQty} onClick={() => setQuantity((q) => Math.max(minQty, q - 1))}>
                <Icon name="minus" />
              </button>
              <label className="visually-hidden" htmlFor="qty">
                Quantity
              </label>
              <input
                id="qty"
                name="qty"
                type="number"
                inputMode="numeric"
                min={minQty}
                max={Math.max(minQty, maxQty)}
                value={quantity}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) setQuantity(Math.min(Math.max(minQty, n), Math.max(minQty, maxQty)));
                }}
              />
              <button type="button" aria-label="Increase quantity" disabled={quantity >= maxQty} onClick={() => setQuantity((q) => Math.min(Math.max(minQty, maxQty), q + 1))}>
                <Icon name="plus" />
              </button>
            </div>
            <button className="btn btn--primary" type="submit" disabled={!inStock}>
              {inStock ? "Add to basket" : "Out of stock"}
            </button>
          </div>
          <p className="form-status" role="status">
            {status}
            {status.endsWith("basket.") ? (
              <>
                {" "}
                <Link href={href(STORE_PATHS.cart)}>View basket</Link>
              </>
            ) : null}
          </p>
        </form>

        {details}
      </div>
    </div>
  );
}
