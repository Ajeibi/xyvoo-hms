"use client";

import { TrackProductView } from "./StoreAnalytics";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaWhatsapp } from "react-icons/fa6";
import { useCartStore } from "@/components/shop/CartProvider";
import type { ShopProduct, ShopProductVariant } from "@/lib/shop/products";
import { cartLineKey, fixedLinePrices } from "@/lib/shop/cart";
import { STORE_PATHS } from "@/lib/store/site/links";
import { announce, useStorefront } from "./StorefrontProvider";
import { Icon, Price, Rating, StoreImage } from "./primitives";
import { GuidePriceNote } from "./ChargeNote";
import SaleEnds from "./SaleEnds";
import StockAlertForm from "./StockAlertForm";
import TradePrice from "./TradePrice";

function findMatchingVariant(variants: ShopProductVariant[], selected: Record<string, string>) {
  return variants.find((v) => Object.entries(selected).every(([key, value]) => v.options[key] === value)) || null;
}

/** Whether any in-stock (or back-orderable) variant has this option value, given the other choices so far. */
function optionAvailable(product: ShopProduct, selected: Record<string, string>, name: string, value: string) {
  if (product.allowBackorder) return true;
  const wanted = { ...selected, [name]: value };
  return product.variants.some((v) => v.stock > 0 && Object.entries(wanted).every(([k, val]) => v.options[k] === val));
}

/** Whether this option value exists at all with the other choices so far (sold out or not). */
function optionExists(product: ShopProduct, selected: Record<string, string>, name: string, value: string) {
  const wanted = { ...selected, [name]: value };
  return product.variants.some((v) => Object.entries(wanted).every(([k, val]) => v.options[k] === val));
}

/** Gallery and buy box for the product page, in the templates' .pdp layout. */
/**
 * `initialVariantId` chooses an option to start with, for links that name one
 * (the product feed links each size or colour to its own page).
 */
export default function ProductDetail({ product, details, initialVariantId }: { product: ShopProduct; details: React.ReactNode; initialVariantId?: string }) {
  const { href, whatsappOrdering } = useStorefront();
  const router = useRouter();
  const addLine = useCartStore((s) => s.addLine);
  const basketLines = useCartStore((s) => s.lines);

  const images = product.imageUrls.length > 0 ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];
  const altFor = (i: number) => product.imageAltTexts[i] || `${product.name}, image ${i + 1} of ${images.length}`;
  const [activeImage, setActiveImage] = useState(0);
  // Choosing an option shows its own photo; clicking a thumbnail afterwards shows that one instead.
  const [showVariantImage, setShowVariantImage] = useState(true);
  const [selected, setSelected] = useState<Record<string, string>>(() => ({ ...product.variants.find((v) => v.id === initialVariantId)?.options }));
  const minQty = Math.max(1, product.minimumOrderQty || 1);
  const [quantity, setQuantity] = useState(minQty);
  const [status, setStatus] = useState("");

  const hasVariants = product.productOptions.length > 0 && product.variants.length > 0;
  const allChosen = product.productOptions.every((opt) => selected[opt.name]);
  const variant = hasVariants && allChosen ? findMatchingVariant(product.variants, selected) : null;
  const price = variant?.priceOverride ?? product.price;
  // A variant on its own sale shows its normal price struck through; one that follows the product's price shows the product's.
  const followsProduct = !variant || variant.priceOverride == null;
  const compareAt = variant?.compareAtPrice ?? (followsProduct ? product.compareAtPrice : null);
  const saleEndsAt = variant?.saleEndsAt ?? (followsProduct && product.onSale ? product.saleEndsAt : null);
  const stock = variant ? variant.stock : product.stock;
  const inStock = product.allowBackorder || (hasVariants && !allChosen ? product.inStock : stock > 0);
  const maxQty = product.allowBackorder ? 99 : Math.max(stock, 0);
  // Fewer left than the smallest order the shop takes, so it can't be bought.
  const belowMinimum = !product.allowBackorder && (!hasVariants || allChosen) && stock > 0 && stock < minQty;
  const buyable = inStock && !belowMinimum;
  // The chosen amount, kept within what the chosen option has (switching to a size with fewer left lowers it).
  const qty = Math.min(Math.max(minQty, quantity), Math.max(minQty, maxQty));
  const variantImage = showVariantImage ? variant?.imageUrl : null;
  const shownImage = variantImage || images[activeImage] || null;
  const variantImageIndex = variantImage ? images.indexOf(variantImage) : -1;
  const shownAlt = !variantImage
    ? altFor(activeImage)
    : variantImageIndex >= 0
      ? altFor(variantImageIndex)
      : `${product.name}, ${Object.values(variant?.options ?? {}).join(" · ")}`;

  const stockText = !inStock
    ? "Out of stock"
    : belowMinimum
      ? `Only ${stock} left, fewer than the minimum order of ${minQty}`
      : product.preorder
        ? "Available to pre-order"
        : !product.allowBackorder && stock > 0 && stock <= 5 && (!hasVariants || allChosen)
          ? `Only ${stock} left in stock`
          : "In stock";

  /**
   * Puts the chosen product in the basket. False (with a message saying why) when an option still needs choosing.
   * `onlyIfMissing` leaves a line already in the basket alone, so it isn't added twice on the way to checkout.
   */
  const addToBasket = (onlyIfMissing = false) => {
    if (hasVariants && !allChosen) {
      setStatus("Please choose " + product.productOptions.filter((o) => !selected[o.name]).map((o) => o.name.toLowerCase()).join(" and ") + ".");
      return false;
    }
    if (hasVariants && !variant) {
      setStatus("That combination isn't available. Please choose another.");
      return false;
    }
    if (belowMinimum) {
      setStatus(`There aren't enough left to make the minimum order of ${minQty}.`);
      return false;
    }
    if (onlyIfMissing && basketLines.some((l) => cartLineKey(l.productId, l.variantId) === cartLineKey(product.id, variant?.id || null))) return true;
    addLine({
      productId: product.id,
      variantId: variant?.id || null,
      name: product.name,
      variantLabel: variant ? Object.values(variant.options).join(" · ") : null,
      imageUrl: variant?.imageUrl || product.imageUrl,
      unitPrice: price,
      currency: product.currency,
      // A variant with its own price is converted; the product's fixed prices are for its base price.
      fixedPrices: variant?.priceOverride != null ? undefined : fixedLinePrices(product.fixedPrices),
      deliveryExtra: product.deliveryExtra || undefined,
      quantity: qty,
      maxQuantity: maxQty,
      minQuantity: minQty,
    });
    return true;
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addToBasket()) return;
    const message = `${product.name} added to your basket.`;
    setStatus(message);
    announce(message);
  };

  // A short checkout with WhatsApp chosen: the order is recorded (and its stock held) before the chat opens.
  const orderOnWhatsApp = () => {
    if (!addToBasket(true)) return;
    announce(`${product.name} is in your basket. Taking you to checkout to send your order on WhatsApp.`);
    router.push(`${href(STORE_PATHS.checkout)}?pay=whatsapp`);
  };

  return (
    <div className="pdp">
      <TrackProductView
        productId={product.id}
        // The ids the product feed uses: one per option, or the product's own.
        itemIds={hasVariants ? product.variants.map((v) => v.id) : [product.id]}
        name={product.name}
        value={product.price}
      />
      <div className="pdp__gallery">
        <div className="media gallery-main tone-4">
          {shownImage ? (
            <StoreImage src={shownImage} alt={shownAlt} sizes="(min-width: 900px) 50vw, 100vw" priority />
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
                  aria-pressed={variantImage ? i === variantImageIndex : i === activeImage}
                  aria-label={`Show image ${i + 1} of ${images.length}`}
                  onClick={() => {
                    setActiveImage(i);
                    setShowVariantImage(false);
                  }}
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
            <Price amount={price} compareAt={compareAt} fixedPrices={variant?.priceOverride != null ? undefined : product.fixedPrices} />
            {saleEndsAt ? <SaleEnds endsAt={saleEndsAt} /> : null}
          </p>
          <GuidePriceNote />
          <TradePrice productId={product.id} />
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
                      // Sold-out sizes can still be chosen, so the shopper can ask to hear when they're back.
                      const exists = available || optionExists(product, selected, option.name, value);
                      return (
                        <label className={`pill${available ? "" : " is-sold-out"}`} key={value}>
                          <input
                            type="radio"
                            name={option.name}
                            value={value}
                            checked={selected[option.name] === value}
                            disabled={!exists}
                            onChange={() => {
                              setSelected((prev) => ({ ...prev, [option.name]: value }));
                              setShowVariantImage(true);
                              setStatus("");
                            }}
                          />
                          <span>
                            {value}
                            {!available ? <span className="visually-hidden"> (sold out)</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))
            : null}

          <p className={`stock${inStock ? "" : " stock--out"}`}>{stockText}</p>

          <div className="buy-row">
            <div className="qty">
              <button type="button" aria-label="Decrease quantity" disabled={qty <= minQty} onClick={() => setQuantity(Math.max(minQty, qty - 1))}>
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
                value={qty}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) setQuantity(Math.min(Math.max(minQty, n), Math.max(minQty, maxQty)));
                }}
              />
              <button type="button" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQuantity(Math.min(Math.max(minQty, maxQty), qty + 1))}>
                <Icon name="plus" />
              </button>
            </div>
            <button className="btn btn--primary" type="submit" disabled={!buyable}>
              {!inStock ? "Out of stock" : belowMinimum ? "Not enough in stock" : "Add to basket"}
            </button>
            {whatsappOrdering && buyable ? (
              <button className="btn btn--whatsapp" type="button" onClick={orderOnWhatsApp} aria-describedby="pdp-whatsapp-hint">
                <FaWhatsapp aria-hidden />
                Order on WhatsApp
              </button>
            ) : null}
          </div>
          {whatsappOrdering && buyable ? (
            <p className="whatsapp-hint" id="pdp-whatsapp-hint">
              Add your details, then send the order to the shop on WhatsApp to agree payment and delivery.
            </p>
          ) : null}
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

        {/* Sold out: offer an email when it's back (for the chosen size or colour, if there is one). */}
        {!inStock && !product.preorder ? (
          <StockAlertForm
            productId={product.id}
            variantId={variant?.id ?? null}
            label={variant ? `${product.name} (${Object.values(variant.options).join(" · ")})` : product.name}
          />
        ) : null}

        {details}
      </div>
    </div>
  );
}
