import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb, StoreImage } from "@/components/storefront-theme/primitives";
import { listPublishedPosts } from "@/lib/store/blog-server";
import { readingMinutes } from "@/lib/store/blog";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { getShopT } from "@/lib/store/i18n/server";
import type { ShopLanguage } from "@/lib/store/i18n/languages";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) return {};
  const t = getShopT(storefront);
  return {
    title: t("listing.blog"),
    description: t("listing.blogDescription", { store: storefront.storeName }),
    alternates: { canonical: STORE_PATHS.blog },
  };
}

const dateText = (iso: string | null, lang: ShopLanguage) =>
  iso ? new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "long", year: "numeric" }) : "";

export default async function StorefrontBlogPage({ params }: Props) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) notFound();
  const posts = await listPublishedPosts(storefront.tenant.id, 24).catch(() => []);
  const t = getShopT(storefront);
  const crumbs = [{ label: t("common.home"), href: storeHref(storefront.basePath, "/") }, { label: t("listing.blog") }];

  return (
    <div className="container section">
      <Breadcrumb t={t} items={crumbs} />
      <h1 className="h-page">{t("listing.blog")}</h1>
      {posts.length === 0 ? (
        <p className="body-copy">{t("listing.noPosts")}</p>
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
                  {dateText(p.publishedAt, t.lang)} · {t("listing.minRead", { count: readingMinutes(p.body) })}
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
