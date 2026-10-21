import ProductReviews from "@/components/storefront-theme/ProductReviews";
import { getShopCatalogue } from "@/lib/shop/catalogue-index";
import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GiftCardBuy from "@/components/storefront-theme/GiftCardBuy";
import ProductDetail from "@/components/storefront-theme/ProductDetail";
import { ProductGridList } from "@/components/storefront-theme/ProductCard";
import { Breadcrumb, Icon, SectionHead } from "@/components/storefront-theme/primitives";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatShopCurrency } from "@/lib/shop/format";
import { parseReviewImages } from "@/lib/store/reviews";
import { getShopProductBySlug, type ShopProduct } from "@/lib/shop/products";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

type Props = { params: Promise<{ slug: string; productSlug: string }>; searchParams: Promise<{ variant?: string | string[] }> };

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

type BundleItem = { quantity: number; name: string; href: string | null; price: number };

/** "What's in the bundle", and what it would cost bought separately. */
function BundleContents({ items, price, currency }: { items: BundleItem[]; price: number; currency: string }) {
  const separately = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const saving = separately - price;
  return (
    <section className="bundle-contents" aria-labelledby="bundle-contents-title">
      <h2 className="bundle-contents__title" id="bundle-contents-title">
        What&rsquo;s in the bundle
      </h2>
      <ul>
        {items.map((i) => (
          <li key={i.name}>
            <span className="bundle-contents__qty">{i.quantity} ×</span> {i.href ? <Link href={i.href}>{i.name}</Link> : i.name}
          </li>
        ))}
      </ul>
      {saving > 0 ? (
        <p className="bundle-contents__saving">
          Worth {formatShopCurrency(separately, currency)} bought separately. <strong>You save {formatShopCurrency(saving, currency)}.</strong>
        </p>
      ) : null}
    </section>
  );
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

export default async function StorefrontProductPage({ params, searchParams }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { storefront, product } = found;
  const { variant } = await searchParams;
  const { basePath, site, siteUrl } = storefront;

  const reviewsQuery = (withExtras: boolean) => {
    const q = createServerSupabaseClient()
      .schema("store")
      .from("product_reviews")
      .select(withExtras ? "id, customer_name, rating, title, comment, created_at, images, verified, reply" : "id, customer_name, rating, title, comment, created_at")
      .eq("tenant_id", storefront.tenant.id)
      .eq("product_id", product.id);
    // Only reviews the shop has approved.
    // Enough for the star breakdown and "Show more"; the average and count come from the product itself.
    return (withExtras ? q.eq("status", "published") : q).order("created_at", { ascending: false }).limit(200);
  };
  const [reviewsResult, catalogue, { data: pairRows }, { data: giftProfile }, { data: bundleRows }] = await Promise.all([
    // Before the reviews migration there are no photos, replies or approval: fall back to the plain list.
    reviewsQuery(true).then((r) => (r.error?.code === "42703" ? reviewsQuery(false) : r)),
    getShopCatalogue(storefront.tenant.id),
    createServerSupabaseClient().schema("store").from("product_cross_sells").select("related_product_id").eq("product_id", product.id),
    createServerSupabaseClient().schema("store").from("business_profile").select("gift_card_product_id").eq("tenant_id", storefront.tenant.id).maybeSingle(),
    createServerSupabaseClient()
      .schema("store")
      .from("product_bundle_items")
      .select("quantity, component:component_product_id(id, name, slug, price, status, visibility)")
      .eq("bundle_product_id", product.id)
      .order("created_at"),
  ]);
  // A bundle lists what's in it; items that are on sale on their own link to their page.
  const bundleItems: BundleItem[] = ((bundleRows || []) as unknown as Array<{
    quantity: number;
    component: { id: string; name: string; slug: string | null; price: number; status: string; visibility: string } | null;
  }>)
    .filter((r) => r.component)
    .map((r) => ({
      quantity: r.quantity,
      name: r.component!.name,
      price: Number(r.component!.price) || 0,
      href: r.component!.status === "active" && r.component!.visibility === "visible" ? storeHref(basePath, STORE_PATHS.product(r.component!.slug || r.component!.id)) : null,
    }));
  // "Goes well with": the merchant's own pairings for this product (in stock). "You may also like": others from its category.
  const byId = new Map(catalogue.map((p) => [p.id, p]));
  const pairs = ((pairRows || []) as Array<{ related_product_id: string }>)
    .map((r) => byId.get(r.related_product_id))
    .filter((p): p is ShopProduct => Boolean(p && p.inStock && p.id !== product.id))
    .slice(0, 4);
  const related = product.category
    ? catalogue.filter((p) => p.category === product.category && p.id !== product.id && !pairs.some((x) => x.id === p.id)).slice(0, 4)
    : [];
  // The shop's gift card has its own buying form instead of "Add to basket".
  const isGiftCard = Boolean(giftProfile?.gift_card_product_id) && giftProfile?.gift_card_product_id === product.id;
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
  // Options with their own prices: a price range for search engines, rather than one price that may not be true.
  const optionPrices = product.variants.map((v) => v.priceOverride ?? product.price);
  const lowPrice = optionPrices.length ? Math.min(...optionPrices) : product.price;
  const highPrice = optionPrices.length ? Math.max(...optionPrices) : product.price;
  const availability = !product.inStock
    ? "https://schema.org/OutOfStock"
    : product.preorder
      ? "https://schema.org/PreOrder"
      : product.allowBackorder && product.stock <= 0 && !product.variants.some((v) => v.stock > 0)
        ? "https://schema.org/BackOrder"
        : "https://schema.org/InStock";
  const seller = { "@type": "Organization", name: storefront.storeName };
  const barcode = product.variants.find((v) => v.barcode)?.barcode ?? null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.imageUrls.length || product.imageUrl ? { image: product.imageUrls.length ? product.imageUrls : [product.imageUrl] } : {}),
    ...(product.shortDescription || product.description ? { description: product.shortDescription || product.description } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(barcode && /^\d{8,14}$/.test(barcode) ? { gtin: barcode } : {}),
    offers:
      highPrice > lowPrice
        ? { "@type": "AggregateOffer", url: productUrl, lowPrice: lowPrice.toFixed(2), highPrice: highPrice.toFixed(2), offerCount: product.variants.length, priceCurrency: product.currency, availability, seller }
        : {
            "@type": "Offer",
            url: productUrl,
            price: product.price.toFixed(2),
            priceCurrency: product.currency,
            // A sale price is only good until the sale ends.
            ...(product.onSale && product.saleEndsAt ? { priceValidUntil: product.saleEndsAt.slice(0, 10) } : {}),
            availability,
            seller,
          },
    ...(product.ratingCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.ratingAverage.toFixed(1), reviewCount: product.ratingCount } }
      : {}),
    // A few of the latest reviews, as search engines show them under the product.
    ...(reviews.length
      ? {
          review: reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
            author: { "@type": "Person", name: r.customer_name },
            datePublished: r.created_at.slice(0, 10),
            ...(r.comment ? { reviewBody: r.comment } : {}),
          })),
        }
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
        {isGiftCard ? (
          <GiftCardBuy product={product} storeName={storefront.storeName} paymentMethods={storefront.paymentMethods} />
        ) : (
          <ProductDetail
            product={product}
            initialVariantId={typeof variant === "string" ? variant : undefined}
            details={
              <>
                {bundleItems.length ? <BundleContents items={bundleItems} price={product.price} currency={product.currency} /> : null}
                <Details product={product} />
              </>
            }
          />
        )}
      </div>

      {isGiftCard ? null : (
        <ProductReviews reviews={reviews} ratingAverage={product.ratingAverage} ratingCount={product.ratingCount} storeName={storefront.tenant.displayName || storefront.storeName} />
      )}

      {pairs.length ? (
        <section className="section section--tight-top" aria-labelledby="pairs-title">
          <div className="container">
            <SectionHead id="pairs-title" heading="Goes well with" />
            <ProductGridList products={pairs} basePath={basePath} variant={site.theme.cardVariant} />
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
