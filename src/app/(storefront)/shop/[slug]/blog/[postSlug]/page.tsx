import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb, StoreImage } from "@/components/storefront-theme/primitives";
import { postDescription, readingMinutes, type BlogBlock } from "@/lib/store/blog";
import { getPost } from "@/lib/store/blog-server";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { getShopT } from "@/lib/store/i18n/server";

type Props = { params: Promise<{ slug: string; postSlug: string }> };

async function load(params: Props["params"]) {
  const { slug, postSlug } = await params;
  const storefront = await getStorefront(slug);
  if (!storefront) return null;
  // A shop member previewing their shop can read a draft or a post not yet live.
  const post = await getPost(storefront.tenant.id, postSlug, storefront.isPreview).catch(() => null);
  return post ? { storefront, post } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  const { post, storefront } = found;
  const description = postDescription(post);
  const live = post.status === "published";
  return {
    title: post.seoTitle || post.title,
    description,
    alternates: { canonical: STORE_PATHS.blogPost(post.slug) },
    robots: live ? undefined : { index: false, follow: false },
    openGraph: {
      type: "article",
      title: post.seoTitle || post.title,
      description,
      publishedTime: post.publishedAt ?? undefined,
      authors: post.author ? [post.author] : undefined,
      images: post.coverUrl ? [{ url: post.coverUrl, alt: post.coverAlt ?? post.title }] : undefined,
      siteName: storefront.storeName,
    },
  };
}

/** Headings, paragraphs, lists and pictures, always shown as text so nothing a shop writes becomes HTML. */
function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "heading":
      return <h2 className="h-card">{block.text}</h2>;
    case "text":
      return (
        <>
          {block.text.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </>
      );
    case "list":
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "image":
      return (
        <figure className="blog-figure">
          <div className="media tone-2">
            <StoreImage src={block.url} alt={block.alt} sizes="(min-width: 48rem) 46rem, 100vw" />
          </div>
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );
  }
}

export default async function StorefrontBlogPostPage({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { storefront, post } = found;
  const url = `${storefront.siteUrl}${STORE_PATHS.blogPost(post.slug)}`;
  const t = getShopT(storefront);
  const crumbs = [
    { label: t("common.home"), href: storeHref(storefront.basePath, "/") },
    { label: t("listing.blog"), href: storeHref(storefront.basePath, STORE_PATHS.blog) },
    { label: post.title },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: postDescription(post),
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    mainEntityOfPage: url,
    image: post.coverUrl ? [post.coverUrl] : undefined,
    author: { "@type": post.author ? "Person" : "Organization", name: post.author || storefront.storeName },
    publisher: { "@type": "Organization", name: storefront.storeName },
  };

  return (
    <article className="container section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumb t={t} items={crumbs} />
      <header className="blog-head">
        <p className="eyebrow">
          {post.publishedAt
            ? new Date(post.publishedAt).toLocaleDateString(t.lang === "en" ? "en-GB" : t.lang, { day: "numeric", month: "long", year: "numeric" })
            : t("listing.draft")}{" "}
          · {t("listing.minRead", { count: readingMinutes(post.body) })}
          {post.author ? ` · ${post.author}` : ""}
        </p>
        <h1 className="h-page">{post.title}</h1>
        {post.summary ? <p className="lead">{post.summary}</p> : null}
      </header>
      {post.coverUrl ? (
        <div className="media tone-2 blog-cover">
          <StoreImage src={post.coverUrl} alt={post.coverAlt ?? ""} sizes="(min-width: 64rem) 60rem, 100vw" priority />
        </div>
      ) : null}
      <div className="page-body body-copy blog-body">
        {post.body.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
      <p>
        <Link className="link-arrow" href={storeHref(storefront.basePath, STORE_PATHS.blog)}>
          {t("listing.allPosts")}
        </Link>
      </p>
    </article>
  );
}
