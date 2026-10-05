import Link from "next/link";
import { CarouselControls, CarouselRoot, CarouselTrack } from "./Carousel";
import Countdown from "./Countdown";
import { ProductGridList } from "./ProductCard";
import { Icon, SectionHead, StoreImage, toIconName } from "./primitives";
import { buildTiles, itemCountLabel, loadSectionProducts, sectionHref, type SectionProps } from "./sections-shared";
import { STORE_PATHS } from "@/lib/store/site/links";

/*
 * Loftwood's homepage sections, ported from
 * design/storefront-templates/loftwood/pages/index.html. Styling comes from
 * that template's theme.css (src/styles/storefront/themes.css).
 */

/**
 * Panel hero. The right-hand side scrolls through the store's collections or
 * categories, as the template's "shop by room" cards; a store with none shows
 * the hero photo there instead.
 */
export function LoftwoodHero({ section, storefront, isFirst }: SectionProps<"hero">) {
  const Heading = isFirst ? "h1" : "h2";
  const tiles = buildTiles(storefront, [], 8);
  const trackId = `${section.id}-rooms`;

  return (
    <section className="hero-lw" aria-labelledby={`${section.id}-title`}>
      <div className="container">
        <div className="hero-lw__panel">
          <div className="hero-lw__content">
            {section.eyebrow ? (
              <p className="pill-label">
                <Icon name="sparkle" />
                {section.eyebrow}
              </p>
            ) : null}
            <Heading className="h-display" id={`${section.id}-title`}>
              {section.heading}
            </Heading>
            {section.text ? <p className="lead">{section.text}</p> : null}
            {section.primaryCta || section.secondaryCta ? (
              <div className="hero-lw__actions">
                {section.primaryCta ? (
                  <Link className="btn btn--primary" href={sectionHref(storefront, section.primaryCta.href)}>
                    {section.primaryCta.label} <Icon name="arrow-right" size="sm" />
                  </Link>
                ) : null}
                {section.secondaryCta ? (
                  <Link className="link-arrow" href={sectionHref(storefront, section.secondaryCta.href)}>
                    {section.secondaryCta.label}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>

          {tiles.length ? (
            <div className="hero-lw__rooms">
              <CarouselRoot>
                <CarouselTrack id={trackId} className="carousel rooms" label="Shop by category, scrollable">
                  {tiles.map((tile, i) => (
                    <li key={tile.key}>
                      <Link className="room-card" href={sectionHref(storefront, tile.path)}>
                        <span className={`media tone-${(i % 4) + 2} room-card__media`} aria-hidden="true">
                          {tile.imageUrl ? <StoreImage src={tile.imageUrl} alt="" sizes="288px" /> : null}
                        </span>
                        <span className="room-card__text">
                          <strong>{tile.label}</strong>
                          {tile.count != null ? <span>{itemCountLabel(tile.count)}</span> : null}
                        </span>
                        <span className="room-card__go" aria-hidden="true">
                          <Icon name="arrow-right" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </CarouselTrack>
                {tiles.length > 1 ? (
                  <CarouselControls trackId={trackId} noun="categories" prevClassName="round-btn round-btn--dark" nextClassName="round-btn round-btn--highlight" />
                ) : null}
              </CarouselRoot>
            </div>
          ) : section.image ? (
            <div className="media tone-4 hero-lw__media">
              <StoreImage src={section.image.url} alt={section.image.alt} sizes="(min-width: 1024px) 45vw, 100vw" priority={isFirst} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function LoftwoodValueStrip({ section }: SectionProps<"value-strip">) {
  if (section.items.length === 0) return null;
  return (
    <section className="features-lw" aria-label="Why shop with us">
      <div className="container">
        <ul className="features-lw__list">
          {section.items.map((item, i) => (
            <li key={i}>
              <span className="feature-icon">
                <Icon name={toIconName(item.icon)} />
              </span>
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

/** Bento grid of up to three categories; the first card is tall. */
export function LoftwoodCategoryTiles({ section, storefront }: SectionProps<"category-tiles">) {
  const tiles = buildTiles(storefront, section.collectionIds, 3);
  if (tiles.length === 0) return null;
  const titleId = `${section.id}-title`;

  return (
    <section className="section section--tight-top" aria-labelledby={titleId}>
      <div className="container">
        <h2 className={section.heading ? "h-section section-head" : "visually-hidden"} id={titleId}>
          {section.heading || "Shop by category"}
        </h2>
        <div className="bento">
          {tiles.map((tile, i) => (
            <article className={`bento__card${i === 0 && tiles.length > 1 ? " bento__card--tall" : ""}`} key={tile.key}>
              {tile.count != null ? <p className="count-pill">{itemCountLabel(tile.count)}</p> : null}
              <h3 className="h-section">
                <Link className="plain-link" href={sectionHref(storefront, tile.path)}>
                  {tile.label}
                </Link>
              </h3>
              <span className={`media tone-${[3, 2, 4][i]} bento__media`} aria-hidden="true">
                {tile.imageUrl ? <StoreImage src={tile.imageUrl} alt="" sizes="(min-width: 900px) 20vw, 100vw" /> : null}
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Product rows; "on sale" rows use the template's three-column deals grid. */
export async function LoftwoodProductList({ section, storefront }: SectionProps<"product-list">) {
  const products = await loadSectionProducts(section, storefront);
  if (products.length === 0) return null;
  const titleId = `${section.id}-title`;

  return (
    <section className="section section--tight-top" aria-labelledby={titleId}>
      <div className="container">
        <SectionHead id={titleId} heading={section.heading} link={{ label: "View all", href: sectionHref(storefront, STORE_PATHS.products) }} />
        <ProductGridList
          products={products}
          basePath={storefront.basePath}
          variant={storefront.site.theme.cardVariant}
          className={section.source === "on-sale" ? "products products--3" : "products"}
        />
      </div>
    </section>
  );
}

/** Flash sale panel with an optional countdown and photo. */
export function LoftwoodPromo({ section, storefront }: SectionProps<"promo">) {
  const titleId = `${section.id}-title`;
  const endsText = section.endsAt
    ? new Date(section.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <section className="section section--tight-top" aria-labelledby={titleId}>
      <div className={`container flash${section.image ? " flash--one" : " flash--solo"}`}>
        <div className="flash__panel">
          {section.eyebrow ? <p className="eyebrow">{section.eyebrow}</p> : null}
          <h2 className="h-section" id={titleId}>
            {section.heading}
          </h2>
          {section.text ? <p className="body-copy">{section.text}</p> : null}
          {section.endsAt && endsText ? <Countdown endsAt={section.endsAt} endsText={endsText} /> : null}
          {section.cta ? (
            <Link className="btn btn--primary" href={sectionHref(storefront, section.cta.href)}>
              {section.cta.label} <Icon name="arrow-right" size="sm" />
            </Link>
          ) : null}
        </div>
        {section.image ? (
          <div className="media tone-2 flash__media">
            <StoreImage src={section.image.url} alt={section.image.alt} sizes="(min-width: 900px) 50vw, 100vw" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
