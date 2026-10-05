import Link from "next/link";
import type { ShopProduct } from "@/lib/shop/products";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import type { SiteTheme } from "@/lib/store/site/schema";
import AddToBasketButton, { type BasketProduct } from "./AddToBasketButton";
import { Icon, Price, Rating, StoreImage } from "./primitives";

const CARD_SIZES = "(min-width: 1024px) 25vw, (min-width: 600px) 33vw, 50vw";

/** Only what the client button needs, so the whole product isn't serialised into the page. */
function toBasketProduct(p: ShopProduct): BasketProduct {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency,
    imageUrl: p.imageUrl,
    stock: p.stock,
    allowBackorder: p.allowBackorder,
    minimumOrderQty: p.minimumOrderQty,
  };
}

function discountPercent(product: ShopProduct) {
  if (product.compareAtPrice == null || product.compareAtPrice <= product.price) return null;
  return Math.round((1 - product.price / product.compareAtPrice) * 100);
}

function CardMedia({ product }: { product: ShopProduct }) {
  return (
    <div className="media card__media" aria-hidden={product.imageUrl ? undefined : true}>
      {product.imageUrl ? (
        <StoreImage src={product.imageUrl} alt={product.imageAltTexts[0] || ""} sizes={CARD_SIZES} />
      ) : (
        <span className="media__label">No photo yet</span>
      )}
    </div>
  );
}

/**
 * Product card in the three template styles (Linden "basket", Sage "view",
 * Loftwood "icons"). Products with options link to their page to choose; the
 * rest can be added straight from the card.
 */
export default function ProductCard({
  product,
  basePath,
  variant,
  headingLevel = 3,
}: {
  product: ShopProduct;
  basePath: string;
  variant: SiteTheme["cardVariant"];
  headingLevel?: 2 | 3;
}) {
  const href = storeHref(basePath, STORE_PATHS.product(product.slug || product.id));
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const needsOptions = product.productOptions.length > 0 && product.variants.length > 0;
  const discount = discountPercent(product);
  const title = (
    <Heading className="card__title">
      <Link href={href}>{product.name}</Link>
    </Heading>
  );
  const price = (
    <p className="card__price">
      <Price amount={product.price} compareAt={product.compareAtPrice} currency={product.currency} />
    </p>
  );
  const chooseLink = (
    <Link className={variant === "view" ? "btn btn--primary btn--sm" : "btn btn--soft"} href={href}>
      {needsOptions ? "Choose options" : "View product"}
      <span className="visually-hidden">: {product.name}</span>
    </Link>
  );

  if (variant === "view") {
    return (
      <article className="card card--view">
        <div className="card__frame">
          <CardMedia product={product} />
          {product.newArrival ? <span className="card__badge">New</span> : null}
        </div>
        <div className="card__body">
          {title}
          {price}
          <div className="card__action">{chooseLink}</div>
        </div>
      </article>
    );
  }

  if (variant === "icons") {
    return (
      <article className="card card--icons">
        <div className="card__frame">
          <CardMedia product={product} />
          {discount ? <span className="tag">-{discount}%</span> : null}
          {!needsOptions ? (
            <div className="card__tools">
              <AddToBasketButton product={toBasketProduct(product)} variant="icon" />
            </div>
          ) : null}
        </div>
        <div className="card__body">
          <div className="card__meta">
            <span>{product.category || ""}</span>
            {product.ratingCount > 0 ? (
              <span className="card__score">
                <span className="visually-hidden">Rated </span>
                <Icon name="star" />
                {product.ratingAverage.toFixed(1)}
                <span className="visually-hidden"> out of 5</span>
              </span>
            ) : null}
          </div>
          {title}
          {price}
        </div>
      </article>
    );
  }

  return (
    <article className="card">
      <CardMedia product={product} />
      {discount ? <span className="tag">-{discount}%</span> : null}
      <div className="card__body">
        {title}
        {price}
        {product.ratingCount > 0 ? <Rating value={product.ratingAverage} count={product.ratingCount} /> : null}
        <div className="card__action">{needsOptions ? chooseLink : <AddToBasketButton product={toBasketProduct(product)} variant="text" />}</div>
      </div>
    </article>
  );
}

export function ProductGridList({
  products,
  basePath,
  variant,
  className = "products",
}: {
  products: ShopProduct[];
  basePath: string;
  variant: SiteTheme["cardVariant"];
  className?: string;
}) {
  return (
    <ul className={className}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} basePath={basePath} variant={variant} />
        </li>
      ))}
    </ul>
  );
}
