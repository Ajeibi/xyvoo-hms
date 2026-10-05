import Link from "next/link";
import { ProductGridList } from "./ProductCard";
import { Icon, StoreImage, toIconName } from "./primitives";
import { buildTiles, loadSectionProducts, sectionHref, type SectionProps } from "./sections-shared";

/*
 * Sage and Stem's homepage sections, ported from
 * design/storefront-templates/sage-and-stem/pages/index.html. Styling comes
 * from that template's theme.css (src/styles/storefront/themes.css).
 */

export function SageHero({ section, storefront, isFirst }: SectionProps<"hero">) {
  const Heading = isFirst ? "h1" : "h2";
  return (
    <section className="hero-sage" aria-labelledby={`${section.id}-title`}>
      <div className="media tone-5 hero-sage__media">
        {section.image ? <StoreImage src={section.image.url} alt={section.image.alt} sizes="100vw" priority={isFirst} /> : null}
      </div>
      <div className="container hero-sage__inner">
        <div className="hero-sage__card">
          {section.eyebrow ? <p className="eyebrow">{section.eyebrow}</p> : null}
          <Heading className="h-display" id={`${section.id}-title`}>
            {section.heading}
          </Heading>
          {section.text ? <p className="lead">{section.text}</p> : null}
          {section.primaryCta ? (
            <Link className="btn btn--primary" href={sectionHref(storefront, section.primaryCta.href)}>
              {section.primaryCta.label}
            </Link>
          ) : null}
          {section.secondaryCta ? (
            <Link className="link-arrow" href={sectionHref(storefront, section.secondaryCta.href)}>
              {section.secondaryCta.label} <Icon name="arrow-right" size="sm" />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function SageValueStrip({ section }: SectionProps<"value-strip">) {
  if (section.items.length === 0) return null;
  return (
    <section className="values-sage" aria-label="Our promises">
      <div className="container">
        <ul className="values-sage__list">
          {section.items.map((item, i) => (
            <li key={i}>
              <Icon name={toIconName(item.icon)} />
              <strong>{item.title}</strong>
              {item.text ? <span>{item.text}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Three image tiles with a pill label; the middle one is oval. */
export function SageCategoryTiles({ section, storefront }: SectionProps<"category-tiles">) {
  const tiles = buildTiles(storefront, section.collectionIds, 3);
  if (tiles.length === 0) return null;
  const titleId = `${section.id}-title`;

  return (
    <section className="section" aria-labelledby={section.heading ? titleId : undefined} aria-label={section.heading ? undefined : "Shop by category"}>
      <div className="container">
        {section.heading ? (
          <h2 className="h-section center-title" id={titleId}>
            {section.heading}
          </h2>
        ) : null}
        <div className="tiles">
          {tiles.map((tile, i) => (
            <Link className={`tile${i === 1 ? " tile--oval" : ""}`} href={sectionHref(storefront, tile.path)} key={tile.key}>
              <span className={`media tone-${[2, 5, 3][i]} tile__media`} aria-hidden="true">
                {tile.imageUrl ? <StoreImage src={tile.imageUrl} alt="" sizes="(min-width: 768px) 33vw, 100vw" /> : null}
              </span>
              <span className="tile__label">Shop {tile.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Centred title over the arch-card grid. */
export async function SageProductList({ section, storefront }: SectionProps<"product-list">) {
  const products = await loadSectionProducts(section, storefront);
  if (products.length === 0) return null;
  const titleId = `${section.id}-title`;

  return (
    <section className="section" aria-labelledby={titleId}>
      <div className="container">
        <h2 className="h-section center-title" id={titleId}>
          {section.heading}
        </h2>
        <ProductGridList products={products} basePath={storefront.basePath} variant={storefront.site.theme.cardVariant} className="products featured-grid" />
      </div>
    </section>
  );
}

/** "Your new favourite": a photo beside an accent-coloured panel. */
export function SagePromo({ section, storefront }: SectionProps<"promo">) {
  const titleId = `${section.id}-title`;
  return (
    <section className="section section--tight-top" aria-labelledby={titleId}>
      <div className="container split-fave">
        <div className="media tone-4 split-fave__media" aria-hidden={section.image ? undefined : true}>
          {section.image ? <StoreImage src={section.image.url} alt={section.image.alt} sizes="(min-width: 900px) 66vw, 100vw" /> : null}
        </div>
        <div className="split-fave__panel">
          {section.eyebrow ? <p>{section.eyebrow}</p> : null}
          <h2 className="h-section" id={titleId}>
            {section.heading}
          </h2>
          {section.text ? <p>{section.text}</p> : null}
          {section.cta ? (
            <Link className="btn btn--light" href={sectionHref(storefront, section.cta.href)}>
              {section.cta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
