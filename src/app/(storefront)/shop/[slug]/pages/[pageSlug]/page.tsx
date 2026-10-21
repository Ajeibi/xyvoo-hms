import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb, StoreImage } from "@/components/storefront-theme/primitives";
import ContactForm from "@/components/storefront-theme/ContactForm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parsePageBlocks, type PageBlock, type PageImage } from "@/lib/store/pages";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront, type Storefront } from "@/lib/store/site/storefront";

type Props = { params: Promise<{ slug: string; pageSlug: string }> };

async function load(params: Props["params"]) {
  const { slug, pageSlug } = await params;
  const storefront = await getStorefront(slug);
  if (!storefront) return null;

  // Store members previewing their shop can also see pages still in draft.
  const { data } = await createServerSupabaseClient()
    .schema("store")
    .from("pages")
    .select("slug, title, body, seo_title, seo_description")
    .eq("tenant_id", storefront.tenant.id)
    .eq("slug", pageSlug)
    .in("status", storefront.isPreview ? ["draft", "published"] : ["published"])
    .maybeSingle();

  return data ? { storefront, page: data } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  return {
    title: found.page.seo_title || found.page.title,
    description: found.page.seo_description || undefined,
    // The page's saved address, never what was typed in the URL.
    alternates: { canonical: STORE_PATHS.page(found.page.slug as string) },
  };
}

/** The store's own contact details from Store details, so the Contact page never goes out of date. */
function ContactDetails({ storefront }: { storefront: Storefront }) {
  const { profile } = storefront;
  const address = [profile.addressLine1, profile.addressLine2, profile.city, profile.state].filter(Boolean).join(", ");
  const whatsappDigits = profile.whatsapp?.replace(/\D/g, "");
  const rows: Array<{ label: string; value: React.ReactNode } | null> = [
    profile.businessEmail ? { label: "Email", value: <a href={`mailto:${profile.businessEmail}`}>{profile.businessEmail}</a> } : null,
    profile.phone ? { label: "Phone", value: <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}>{profile.phone}</a> } : null,
    whatsappDigits
      ? { label: "WhatsApp", value: <a href={`https://wa.me/${whatsappDigits}`} rel="noopener noreferrer" target="_blank">{profile.whatsapp}</a> }
      : null,
    address ? { label: "Address", value: address } : null,
  ];
  const shown = rows.filter((r): r is { label: string; value: React.ReactNode } => r !== null);
  if (!shown.length) return null;

  return (
    <dl className="spec">
      {shown.map((row) => (
        <Fragment key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Where a page button goes: "shop", "home" or "page:<slug>". */
function linkHref(storefront: Storefront, link: string) {
  if (link === "shop") return storeHref(storefront.basePath, STORE_PATHS.products);
  if (link === "home") return storeHref(storefront.basePath, STORE_PATHS.home);
  return storeHref(storefront.basePath, STORE_PATHS.page(link.replace(/^page:/, "")));
}

function Picture({ image, sizes, className = "", priority = false }: { image: PageImage; sizes: string; className?: string; priority?: boolean }) {
  return (
    <div className={`media tone-2 ${className}`.trim()}>
      <StoreImage src={image.url} alt={image.alt} sizes={sizes} priority={priority} />
    </div>
  );
}

/** Headings, text, lists, FAQs and contact details: the reading-column blocks. */
function FlowBlock({ block, storefront }: { block: PageBlock; storefront: Storefront }) {
  switch (block.type) {
    case "heading":
      return <h2 className="h-card">{block.text}</h2>;
    case "text":
      return (
        <>
          {block.text.split(/\n{2,}/).map((para, j) => (
            <p key={j}>{para}</p>
          ))}
        </>
      );
    case "list":
      return (
        <ul>
          {block.items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
    case "faq":
      return (
        <div className="accordion">
          {block.items.map((item, j) => (
            <details key={j}>
              <summary>{item.question}</summary>
              <div className="accordion__body">
                <p>{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
      );
    case "contact":
      return <ContactDetails storefront={storefront} />;
    default:
      return null;
  }
}

const FULL_WIDTH = new Set<PageBlock["type"]>(["hero", "split", "steps", "cta", "contact_form"]);

export default async function StorefrontContentPage({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { storefront, page } = found;
  const blocks = parsePageBlocks(page.body);
  const crumbs = [{ label: "Home", href: storeHref(storefront.basePath, "/") }, { label: page.title }];
  const privacy = storefront.pages.find((p) => p.systemKey === "privacy");
  const privacyHref = privacy ? storeHref(storefront.basePath, STORE_PATHS.page(privacy.slug)) : null;

  // Runs of reading-column blocks are grouped into one section; the rest are sections of their own.
  const groups: Array<{ full: true; block: PageBlock; index: number } | { full: false; blocks: PageBlock[]; index: number }> = [];
  blocks.forEach((block, index) => {
    if (FULL_WIDTH.has(block.type)) groups.push({ full: true, block, index });
    else {
      const last = groups[groups.length - 1];
      if (last && !last.full) last.blocks.push(block);
      else groups.push({ full: false, blocks: [block], index });
    }
  });
  const startsWithHero = blocks[0]?.type === "hero";

  return (
    <>
      {startsWithHero ? null : (
        <div className="container section section--tight-bottom">
          <Breadcrumb items={crumbs} />
          <h1 className="h-page">{page.title}</h1>
        </div>
      )}
      {groups.map((group) => {
        if (!group.full) {
          return (
            <section className="section section--tight-top" key={group.index}>
              <div className="container page-body body-copy">
                {group.blocks.map((block, i) => (
                  <FlowBlock key={i} block={block} storefront={storefront} />
                ))}
              </div>
            </section>
          );
        }
        const block = group.block;
        const id = `block-${group.index}`;
        switch (block.type) {
          case "hero": {
            const isTop = group.index === 0;
            const Heading = isTop ? "h1" : "h2";
            const content = (
              <>
                {isTop ? <Breadcrumb items={crumbs} /> : null}
                {block.eyebrow ? <p className="eyebrow">{block.eyebrow}</p> : null}
                <Heading className="h-page" id={`${id}-title`}>
                  {block.heading}
                </Heading>
                {block.lead ? <p className="lead">{block.lead}</p> : null}
              </>
            );
            return (
              <section className="page-hero" aria-labelledby={`${id}-title`} key={group.index}>
                {block.image ? (
                  <div className="page-hero__grid">
                    <div className="page-hero__content">{content}</div>
                    <Picture image={block.image} sizes="(min-width: 64rem) 50vw, 100vw" className="page-hero__media" priority={isTop} />
                  </div>
                ) : (
                  <div className="container page-hero__simple">{content}</div>
                )}
              </section>
            );
          }
          case "split": {
            const [main, ...rest] = block.images;
            const media = main ? (
              <div className={`split__media${rest.length ? "" : " split__media--single"}`}>
                <Picture image={main} sizes="(min-width: 64rem) 30vw, 60vw" />
                {rest.length ? (
                  <div>
                    {rest.map((img, j) => (
                      <Picture key={j} image={img} sizes="(min-width: 64rem) 20vw, 40vw" />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null;
            return (
              <section className="section" aria-labelledby={`${id}-title`} key={group.index}>
                <div className={`container split${block.imageSide === "right" ? " split--reverse" : ""}${media ? "" : " split--text"}`}>
                  {media}
                  <div className="split__content">
                    {block.eyebrow ? <p className="eyebrow">{block.eyebrow}</p> : null}
                    <h2 className="h-section" id={`${id}-title`}>
                      {block.heading}
                    </h2>
                    {block.text.split(/\n{2,}/).map((para, j) => (
                      <p className="body-copy" key={j}>
                        {para}
                      </p>
                    ))}
                  </div>
                </div>
              </section>
            );
          }
          case "steps":
            return (
              <section className="section" aria-labelledby={block.heading ? `${id}-title` : undefined} aria-label={block.heading ? undefined : "Our approach"} key={group.index}>
                <div className="container">
                  {block.heading || block.eyebrow ? (
                    <div className="section-head section-head--center">
                      <div>
                        {block.eyebrow ? <p className="eyebrow">{block.eyebrow}</p> : null}
                        {block.heading ? (
                          <h2 className="h-section" id={`${id}-title`}>
                            {block.heading}
                          </h2>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <ol className="steps">
                    {block.items.map((item, j) => (
                      <li key={j}>
                        <span className="steps__num" aria-hidden="true">
                          {String(j + 1).padStart(2, "0")}
                        </span>
                        <h3>{item.title}</h3>
                        <p>{item.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            );
          case "cta":
            return (
              <section className="cta-band" aria-labelledby={`${id}-title`} key={group.index}>
                <div className="container cta-band__inner">
                  <div>
                    <h2 className="h-section" id={`${id}-title`}>
                      {block.heading}
                    </h2>
                    {block.text ? <p className="body-copy">{block.text}</p> : null}
                  </div>
                  <div className="cta-band__actions">
                    {block.buttons.map((b, j) => (
                      <Link key={j} className={`btn ${j === 0 ? "btn--primary" : "btn--outline"}`} href={linkHref(storefront, b.link)}>
                        {b.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            );
          case "contact_form":
            return (
              <section className="section" aria-label="Contact details and form" key={group.index}>
                <div className="container contact-grid">
                  <ContactForm heading={block.heading} intro={block.intro} replyTime={block.replyTime} privacyHref={privacyHref} />
                  <div className="contact-aside">
                    <div className="details">
                      <h2 className="h-card">Other ways to reach us</h2>
                      <ContactDetails storefront={storefront} />
                      {block.hours ? (
                        <>
                          <h3 className="h-card">Opening hours</h3>
                          {block.hours.split(/\n+/).map((line, j) => (
                            <p className="body-copy" key={j}>
                              {line}
                            </p>
                          ))}
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
