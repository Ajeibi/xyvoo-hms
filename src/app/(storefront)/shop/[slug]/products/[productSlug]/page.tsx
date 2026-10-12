import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetail from "@/components/storefront-theme/ProductDetail";
import { ProductGridList } from "@/components/storefront-theme/ProductCard";
import { Breadcrumb, Icon, Rating, SectionHead } from "@/components/storefront-theme/primitives";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseReviewImages } from "@/lib/store/reviews";
import { getShopProductBySlug, listShopProducts, type ShopProduct } from "@/lib/shop/products";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

type Props = { params: Promise<{ slug: string; productSlug: string }> };

async function load(params: Props["params"]) {
  const { slug, productSlug } = await params;
  const storefront = await getStorefront(slug);
  if (!storefront) return null;
  const product = await getShopProductBySlug(storefront.tenant.id, decodeURIComponent(productSlug));
  return product ? { storefront, product } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  const { product } = found;
  const description = product.shortDescription || product.description?.slice(0, 160) || undefined;
  return {
    title: product.name,
    description,
    alternates: { canonical: STORE_PATHS.product(product.slug || product.id) },
    openGraph: { type: "website", title: product.name, description, images: product.imageUrl ? [{ url: product.imageUrl }] : undefined },
  };
}

function paragraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => <p key={i}>{p}</p>);
}

function Details({ product }: { product: ShopProduct }) {
  const perks = [
    product.returnable
      ? { icon: "returns" as const, text: product.returnWindowDays ? `${product.returnWindowDays}-day returns` : "Returns accepted" }
      : { icon: "returns" as const, text: "This item can't be returned" },
    ...(product.warrantyText ? [{ icon: "shield-plain" as const, text: product.warrantyText }] : []),
  ];
  const specs = [
    product.brand ? ["Brand", product.brand] : null,
    product.sku ? ["Product code", product.sku] : null,
    product.weightKg ? ["Weight", `${product.weightKg} kg`] : null,
  ].filter((s): s is [string, string] => s !== null);

  return (
    <>
      <ul className="perks">
        {perks.map((perk) => (
          <li key={perk.text}>
            <Icon name={perk.icon} />
            <span>{perk.text}</span>
          </li>
        ))}
      </ul>
      <div className="accordion">
        {product.description ? (
          <details open>
            <summary>
              Description
              <Icon name="plus" />
            </summary>
            <div className="accordion__body">{paragraphs(product.description)}</div>
          </details>
        ) : null}
        {specs.length ? (
          <details>
            <summary>
              Details
              <Icon name="plus" />
            </summary>
            <div className="accordion__body">
              <dl className="spec">
                {specs.map(([label, value]) => (
                  <Fragment key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}

export default async function StorefrontProductPage({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { storefront, product } = found;
  const { basePath, site, siteUrl } = storefront;

  const reviewsQuery = (withExtras: boolean) => {
    const q = createServerSupabaseClient()
      .schema("store")
      .from("product_reviews")
      .select(withExtras ? "id, customer_name, rating, title, comment, created_at, images, verified, reply" : "id, customer_name, rating, title, comment, created_at")
      .eq("tenant_id", storefront.tenant.id)
      .eq("product_id", product.id);
    // Only reviews the shop has approved.
    return (withExtras ? q.eq("status", "published") : q).order("created_at", { ascending: false }).limit(10);
  };
  const [reviewsResult, related] = await Promise.all([
    // Before the reviews migration there are no photos, replies or approval: fall back to the plain list.
    reviewsQuery(true).then((r) => (r.error?.code === "42703" ? reviewsQuery(false) : r)),
    product.category
      ? listShopProducts(storefront.tenant.id, { category: product.category, pageSize: 5 }).then((r) => r.products.filter((p) => p.id !== product.id).slice(0, 4))
      : Promise.resolve([] as ShopProduct[]),
  ]);
  const reviews = ((reviewsResult.data || []) as unknown as Array<{
    id: string;
    customer_name: string;
    rating: number;
    title: string | null;
    comment: string | null;
    created_at: string;
    images?: Array<{ url: string }> | null;
    verified?: boolean;
    reply?: string | null;
  }>).map((r) => ({ ...r, images: parseReviewImages(r.images) }));

  const productUrl = `${siteUrl}${STORE_PATHS.product(product.slug || product.id)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.imageUrls.length || product.imageUrl ? { image: product.imageUrls.length ? product.imageUrls : [product.imageUrl] } : {}),
    ...(product.shortDescription || product.description ? { description: product.shortDescription || product.description } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    offers: {
      "@type": "Offer",
      url: productUrl,
      price: product.price.toFixed(2),
      priceCurrency: product.currency,
      // A sale price is only good until the sale ends.
      ...(product.onSale && product.saleEndsAt ? { priceValidUntil: product.saleEndsAt.slice(0, 10) } : {}),
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(product.ratingCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.ratingAverage.toFixed(1), reviewCount: product.ratingCount } }
      : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container section">
        <Breadcrumb
          items={[
            { label: "Home", href: storeHref(basePath, "/") },
            { label: site.content.shop.title || "Shop", href: storeHref(basePath, STORE_PATHS.products) },
            ...(product.category ? [{ label: product.category, href: storeHref(basePath, STORE_PATHS.category(product.category)) }] : []),
            { label: product.name },
          ]}
        />
        <ProductDetail product={product} details={<Details product={product} />} />
      </div>

      {reviews.length ? (
        <section className="section section--tight-top" id="reviews" aria-labelledby="reviews-title">
          <div className="container reviews-layout">
            <div className="reviews-summary">
              <h2 className="h-card" id="reviews-title">
                Customer reviews
              </h2>
              {product.ratingCount > 0 ? (
                <>
                  <p>
                    <span className="score">{product.ratingAverage.toFixed(1)}</span> <span className="muted">out of 5</span>
                  </p>
                  <Rating value={product.ratingAverage} count={product.ratingCount} />
                </>
              ) : null}
            </div>
            <ul className="review-list">
              {reviews.map((review) => (
                <li className="review-item" key={review.id}>
                  <Rating value={review.rating} />
                  {review.title ? <h3>{review.title}</h3> : null}
                  {review.comment ? <p>{review.comment}</p> : null}
                  {review.images.length ? (
                    <ul className="review-photos" aria-label={`Photos from ${review.customer_name}`}>
                      {review.images.map((img, j) => (
                        <li key={img.url}>
                          <a href={img.url} target="_blank" rel="noopener noreferrer">
                            <img src={img.url} alt={`Photo ${j + 1} from ${review.customer_name}'s review`} loading="lazy" decoding="async" />
                            <span className="visually-hidden"> (opens full size in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="review-meta">
                    {review.customer_name} ·{" "}
                    {new Date(review.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    {review.verified ? (
                      <>
                        {" "}
                        · <span className="review-verified">Verified purchase</span>
                      </>
                    ) : null}
                  </p>
                  {review.reply ? (
                    <div className="review-reply">
                      <strong>Reply from {storefront.tenant.displayName || storefront.tenant.name}</strong>
                      <p>{review.reply}</p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {related.length ? (
        <section className="section section--tight-top" aria-labelledby="related-title">
          <div className="container">
            <SectionHead
              id="related-title"
              heading="You may also like"
              link={product.category ? { label: `More ${product.category}`, href: storeHref(basePath, STORE_PATHS.category(product.category)) } : undefined}
            />
            <ProductGridList products={related} basePath={basePath} variant={site.theme.cardVariant} />
          </div>
        </section>
      ) : null}
    </>
  );
}
