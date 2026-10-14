import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb, StoreImage } from "@/components/storefront-theme/primitives";
import { listPublishedPosts } from "@/lib/store/blog-server";
import { readingMinutes } from "@/lib/store/blog";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) return {};
  return {
    title: "Blog",
    description: `News, stories and advice from ${storefront.storeName}.`,
    alternates: { canonical: STORE_PATHS.blog },
  };
}

const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

export default async function StorefrontBlogPage({ params }: Props) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) notFound();
  const posts = await listPublishedPosts(storefront.tenant.id, 24).catch(() => []);
  const crumbs = [{ label: "Home", href: storeHref(storefront.basePath, "/") }, { label: "Blog" }];

  return (
    <div className="container section">
      <Breadcrumb items={crumbs} />
      <h1 className="h-page">Blog</h1>
      {posts.length === 0 ? (
        <p className="body-copy">There are no posts yet. Please check back soon.</p>
      ) : (
        <ul className="blog-list">
          {posts.map((p) => (
            <li key={p.id} className="blog-card">
              {p.coverUrl ? (
                <Link href={storeHref(storefront.basePath, STORE_PATHS.blogPost(p.slug))} className="media tone-2 blog-card__media" tabIndex={-1} aria-hidden="true">
                  <StoreImage src={p.coverUrl} alt="" sizes="(min-width: 64rem) 30vw, 90vw" />
                </Link>
              ) : null}
              <div className="blog-card__body">
                <p className="eyebrow">
                  {dateText(p.publishedAt)} · {readingMinutes(p.body)} min read
                </p>
                <h2 className="h-card">
                  <Link href={storeHref(storefront.basePath, STORE_PATHS.blogPost(p.slug))}>{p.title}</Link>
                </h2>
                {p.summary ? <p className="body-copy">{p.summary}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
