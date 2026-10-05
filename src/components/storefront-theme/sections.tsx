import Link from "next/link";
import { STORE_PATHS } from "@/lib/store/site/links";
import type { SiteSection } from "@/lib/store/site/schema";
import type { Storefront } from "@/lib/store/site/storefront";
import type { StorefrontTemplateSlug } from "@/lib/store/site/templates";
import { ProductGridList } from "./ProductCard";
import ReviewsCarousel from "./ReviewsCarousel";
import { Icon, SectionHead, StoreImage, toIconName } from "./primitives";
import { LoftwoodCategoryTiles, LoftwoodHero, LoftwoodProductList, LoftwoodPromo, LoftwoodValueStrip } from "./sections-loftwood";
import { SageCategoryTiles, SageHero, SagePromo, SageProductList, SageValueStrip } from "./sections-sage";
import { buildTiles, loadHomeReviews, loadSectionProducts, sectionHref, type SectionProps } from "./sections-shared";

/*
 * Homepage sections. The components in this file are Linden Home's markup
 * (design/storefront-templates/linden-home/pages/index.html), which is also
 * the base every template shares; Sage and Stem and Loftwood replace the
 * sections whose markup differs (sections-sage.tsx, sections-loftwood.tsx).
 */

function Hero({ section, storefront, isFirst }: SectionProps<"hero">) {
  const Heading = isFirst ? "h1" : "h2";
  return (
    <section className="hero" aria-labelledby={`${section.id}-title`}>
      <div className="hero__grid">
        <div className="hero__content">
          {section.eyebrow ? <p className="eyebrow">{section.eyebrow}</p> : null}
          <Heading className="h-display" id={`${section.id}-title`}>
            {section.heading}
          </Heading>
          {section.text ? <p className="lead">{section.text}</p> : null}
          {section.primaryCta ? (
            <Link className="btn btn--primary" href={sectionHref(storefront, section.primaryCta.href)}>
              {section.primaryCta.label} <Icon name="arrow-right" size="sm" />
            </Link>
          ) : null}
          {section.secondaryCta ? (
            <Link className="link-arrow" href={sectionHref(storefront, section.secondaryCta.href)}>
              {section.secondaryCta.label} <Icon name="arrow-right" size="sm" />
            </Link>
          ) : null}
        </div>
        <div className="hero__media media tone-4">
          {section.image ? (
            <StoreImage src={section.image.url} alt={section.image.alt} sizes="(min-width: 900px) 58vw, 100vw" priority={isFirst} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ValueStrip({ section }: SectionProps<"value-strip">) {
  if (section.items.length === 0) return null;
  return (
    <section className="trust" aria-label="Why shop with us">
      <div className="container">
        <ul className="trust__list">
          {section.items.map((item, i) => (
            <li className="trust__item" key={i}>
              <Icon name={toIconName(item.icon)} size="lg" />
              <div>
                <p className="trust__title">{item.title}</p>
                {item.text ? <p className="trust__text">{item.text}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CategoryTiles({ section, storefront }: SectionProps<"category-tiles">) {
  const tiles = buildTiles(storefront, section.collectionIds, 8);
  if (tiles.length === 0) return null;
  const titleId = `${section.id}-title`;

  return (
    <section className="section" aria-labelledby={section.heading ? titleId : undefined} aria-label={section.heading ? undefined : "Shop by category"}>
      <div className="container">
        {section.heading ? (
          <SectionHead id={titleId} heading={section.heading} link={{ label: "View all products", href: sectionHref(storefront, STORE_PATHS.products) }} />
        ) : null}
        <ul className="categories">
          {tiles.map((tile, i) => (
            <li key={tile.key}>
              <Link className="category" href={sectionHref(storefront, tile.path)}>
                <span className={`media tone-${(i % 5) + 1}`} aria-hidden="true">
                  {tile.imageUrl ? <StoreImage src={tile.imageUrl} alt="" sizes="140px" /> : null}
                </span>
                {tile.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FeaturedCollections({ section, storefront }: SectionProps<"featured-collections">) {
  const collections = section.collectionIds.length
    ? storefront.collections.filter((c) => section.collectionIds.includes(c.id))
    : storefront.collections.slice(0, 2);
  if (collections.length === 0) return null;

  return (
    <section className="section section--tight-top" aria-label={section.heading || "Featured collections"}>
      <div className="container banners">
        {collections.map((c, i) => (
          <article className="banner" key={c.id}>
            <div className="banner__content">
              <p className="eyebrow">Featured collection</p>
              <h2 className="h-card">{c.name}</h2>
              {c.description ? <p>{c.description}</p> : null}
              <Link className="btn btn--primary" href={sectionHref(storefront, STORE_PATHS.collection(c.slug))}>
                Shop {c.name} <Icon name="arrow-right" size="sm" />
              </Link>
            </div>
            <div className={`media tone-${i % 2 ? 4 : 2}`} aria-hidden={c.imageUrl ? undefined : true}>
              {c.imageUrl ? <StoreImage src={c.imageUrl} alt={c.imageAlt || ""} sizes="(min-width: 900px) 25vw, 100vw" /> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

async function ProductList({ section, storefront }: SectionProps<"product-list">) {
  const products = await loadSectionProducts(section, storefront);
  if (products.length === 0) return null;

  const titleId = `${section.id}-title`;
  return (
    <section className="section section--tight-top" aria-labelledby={titleId}>
      <div className="container">
        <SectionHead id={titleId} heading={section.heading} link={{ label: "View all", href: sectionHref(storefront, STORE_PATHS.products) }} />
        <ProductGridList products={products} basePath={storefront.basePath} variant={storefront.site.theme.cardVariant} />
      </div>
    </section>
  );
}

// Promotions past their end date are already removed by getStorefront.
function Promo({ section, storefront }: SectionProps<"promo">) {
  return (
    <section className="section section--tight-top" aria-labelledby={`${section.id}-title`}>
      <div className="container banners">
        <article className="banner">
          <div className="banner__content">
            {section.eyebrow ? <p className="eyebrow">{section.eyebrow}</p> : null}
            <h2 className="h-card" id={`${section.id}-title`}>
              {section.heading}
            </h2>
            {section.text ? <p>{section.text}</p> : null}
            {section.cta ? (
              <Link className="btn btn--primary" href={sectionHref(storefront, section.cta.href)}>
                {section.cta.label} <Icon name="arrow-right" size="sm" />
              </Link>
            ) : null}
          </div>
          <div className="media tone-2" aria-hidden={section.image ? undefined : true}>
            {section.image ? <StoreImage src={section.image.url} alt={section.image.alt} sizes="(min-width: 900px) 50vw, 100vw" /> : null}
          </div>
        </article>
      </div>
    </section>
  );
}

async function Reviews({ section, storefront }: SectionProps<"reviews">) {
  const reviews = await loadHomeReviews(storefront);
  if (reviews.length === 0) return null;
  const highlightNext = storefront.site.template.slug === "loftwood";
  return <ReviewsCarousel id={section.id} heading={section.heading} reviews={reviews} nextClassName={highlightNext ? "round-btn round-btn--highlight" : undefined} />;
}

function Press({ section }: SectionProps<"press">) {
  if (section.names.length === 0) return null;
  return (
    <section className="press" aria-labelledby={`${section.id}-title`}>
      <div className="container">
        <h2 className="press__title" id={`${section.id}-title`}>
          {section.heading || "As featured in"}
        </h2>
        <ul className="press__logos">
          {section.names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Gallery({ section }: SectionProps<"gallery">) {
  if (section.images.length === 0) return null;
  const titleId = `${section.id}-title`;
  return (
    <section className="section section--tight-top" aria-labelledby={section.heading ? titleId : undefined} aria-label={section.heading ? undefined : "Gallery"}>
      <div className="container">
        {section.heading ? <SectionHead id={titleId} heading={section.heading} /> : null}
        <ul className="gallery">
          {section.images.map((image, i) => (
            <li key={image.url + i}>
              <span className="media">
                <StoreImage src={image.url} alt={image.alt} sizes="(min-width: 900px) 16vw, 33vw" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

type RenderableType = Exclude<SiteSection["type"], "journal" | "newsletter">;
type SectionComponent<T extends RenderableType> = (props: SectionProps<T>) => React.ReactNode | Promise<React.ReactNode>;
type SectionSet = { [T in RenderableType]: SectionComponent<T> };

const BASE: SectionSet = {
  hero: Hero,
  "value-strip": ValueStrip,
  "category-tiles": CategoryTiles,
  "featured-collections": FeaturedCollections,
  "product-list": ProductList,
  promo: Promo,
  reviews: Reviews,
  press: Press,
  gallery: Gallery,
};

const TEMPLATE_SECTIONS: Record<StorefrontTemplateSlug, SectionSet> = {
  "linden-home": BASE,
  "sage-and-stem": {
    ...BASE,
    hero: SageHero,
    "value-strip": SageValueStrip,
    "category-tiles": SageCategoryTiles,
    "product-list": SageProductList,
    promo: SagePromo,
  },
  loftwood: {
    ...BASE,
    hero: LoftwoodHero,
    "value-strip": LoftwoodValueStrip,
    "category-tiles": LoftwoodCategoryTiles,
    "product-list": LoftwoodProductList,
    promo: LoftwoodPromo,
  },
};

type RenderableSection = Extract<SiteSection, { type: RenderableType }>;

function renderSection(set: SectionSet, section: RenderableSection, storefront: Storefront, isFirst: boolean) {
  // SectionSet pairs each type with its own component, so this lookup is always the matching one.
  const Component = set[section.type] as unknown as (props: { section: RenderableSection; storefront: Storefront; isFirst: boolean }) => React.ReactNode;
  return <Component key={section.id} section={section} storefront={storefront} isFirst={isFirst} />;
}

/**
 * Renders the homepage sections in the merchant's order, using the store's
 * template's markup. Sections with nothing to show (no products, no
 * collections, no reviews) render nothing rather than an empty frame. Journal
 * and newsletter wait on a blog and a subscriber list, so they don't render
 * yet even if switched on.
 */
export default function HomeSections({ storefront }: { storefront: Storefront }) {
  const set = TEMPLATE_SECTIONS[storefront.site.template.slug];
  const visible = storefront.site.sections.filter(
    (s): s is RenderableSection => s.enabled && s.type !== "journal" && s.type !== "newsletter",
  );
  const firstIsHero = visible[0]?.type === "hero";

  return (
    <>
      {!firstIsHero ? <h1 className="visually-hidden">{storefront.storeName}</h1> : null}
      {visible.map((section, i) => renderSection(set, section, storefront, i === 0))}
    </>
  );
}
