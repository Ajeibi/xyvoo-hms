import "@/styles/storefront/base.css";
import "@/styles/storefront/themes.css";
import "@/styles/storefront/app.css";
import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import StoreFooter from "@/components/storefront-theme/StoreFooter";
import StoreHeader, { type HeaderNavItem } from "@/components/storefront-theme/StoreHeader";
import { StorefrontProvider } from "@/components/storefront-theme/StorefrontProvider";
import { storeSocialLinks } from "@/components/storefront-theme/socials";
import { getFontPairing } from "@/lib/store/site/fonts";
import { menuItemPath, STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { fontVariableClasses } from "@/lib/store/site/next-fonts";
import { getStorefront, type Storefront } from "@/lib/store/site/storefront";

/*
 * Root layout for every storefront page. It is its own root layout (no
 * platform layout above it), so stores load none of XYVOO's styles, fonts,
 * favicon or structured data: only the template's CSS and the merchant's brand.
 */

type LayoutParams = { params: Promise<{ slug: string }> };

// Swaps html.no-js for html.js before paint, as the static templates do, so
// menus and panels that need JavaScript stay usable without it.
const ENHANCE_SCRIPT = `document.documentElement.classList.replace("no-js","js");if(window.self!==window.top)document.documentElement.classList.add("is-framed");`;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

export async function generateMetadata({ params }: LayoutParams): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) return {};
  const { seo, brand } = storefront.site;
  const icon = brand.faviconUrl || brand.logoUrl;

  return {
    // Relative canonical paths on each page resolve against the store's subdomain.
    metadataBase: new URL(storefront.siteUrl),
    title: { default: seo.title, template: `%s | ${storefront.storeName}` },
    description: seo.description || undefined,
    // Unpublished stores (and draft previews) stay out of search results.
    robots: storefront.isLive ? undefined : { index: false, follow: false },
    icons: icon ? { icon } : undefined,
    openGraph: {
      siteName: storefront.storeName,
      type: "website",
      locale: "en_NG",
      images: seo.shareImageUrl ? [{ url: seo.shareImageUrl }] : undefined,
    },
    twitter: { card: "summary_large_image" },
  };
}

export async function generateViewport({ params }: LayoutParams): Promise<Viewport> {
  const storefront = await getStorefront((await params).slug);
  return { themeColor: storefront?.site.theme.colours.bg };
}

function headerNavItems(storefront: Storefront): HeaderNavItem[] {
  const { basePath, categories } = storefront;
  return storefront.site.navigation.header.flatMap((item): HeaderNavItem[] => {
    const path = menuItemPath(item);
    if (!path) return [];
    // "Shop" opens a list of the store's categories, as in the templates.
    if (item.type === "shop" && categories.length > 1) {
      return [
        {
          label: item.label,
          href: storeHref(basePath, path),
          children: [
            { label: "All products", href: storeHref(basePath, STORE_PATHS.products) },
            ...categories.slice(0, 12).map((c) => ({ label: c, href: storeHref(basePath, STORE_PATHS.category(c)) })),
          ],
        },
      ];
    }
    return [{ label: item.label, href: storeHref(basePath, path) }];
  });
}

function OpeningSoon({ storefront }: { storefront: Storefront }) {
  return (
    <main id="main" tabIndex={-1} className="opening-soon">
      <div>
        <p className="eyebrow">Opening soon</p>
        <h1 className="h-display">{storefront.storeName}</h1>
        <p className="lead">We&rsquo;re putting the finishing touches to our shop. Please check back soon.</p>
      </div>
    </main>
  );
}

export default async function StorefrontLayout({ children, params }: LayoutParams & { children: React.ReactNode }) {
  const { slug } = await params;
  const storefront = await getStorefront(slug);
  if (!storefront) notFound();

  const { site, basePath, storeName } = storefront;
  const showMark = site.template.slug === "loftwood";
  const visible = storefront.isLive || storefront.isPreview;

  return (
    <html
      lang="en"
      className={`no-js ${fontVariableClasses(getFontPairing(site.theme.fontPairing))}`}
      data-template={site.template.slug}
      style={site.cssVariables as CSSProperties}
      suppressHydrationWarning
    >
      <body>
        <Script id="sf-enhance" strategy="beforeInteractive">
          {ENHANCE_SCRIPT}
        </Script>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        {storefront.isPreview ? (
          <div className="preview-bar" role="note">
            You&rsquo;re previewing your unpublished shop. Customers can&rsquo;t see it yet.{" "}
            <a href={`${APP_URL}/storefront/${slug}/dashboard`}>Back to your dashboard</a>
          </div>
        ) : null}

        {visible ? (
          <StorefrontProvider value={{ slug, basePath, currency: storefront.profile.currencyCode }}>
            <StoreHeader
              brand={{ storeName, homeHref: storeHref(basePath, "/"), logoUrl: site.brand.logoUrl, logoAlt: site.brand.logoAlt, showMark }}
              navItems={headerNavItems(storefront)}
              announcement={{
                text: site.content.announcement.text,
                href: site.content.announcement.href ? storeHref(basePath, site.content.announcement.href) : null,
              }}
              productsHref={storeHref(basePath, STORE_PATHS.products)}
              cartHref={storeHref(basePath, STORE_PATHS.cart)}
              logoPosition={site.template.slug === "sage-and-stem" ? "centre" : "start"}
              topbarExtras={showMark ? { phone: storefront.profile.phone, socials: storeSocialLinks(storefront) } : undefined}
            />
            <main id="main" tabIndex={-1}>
              {children}
            </main>
            <StoreFooter storefront={storefront} showMark={showMark} />
          </StorefrontProvider>
        ) : (
          <OpeningSoon storefront={storefront} />
        )}

        <div className="visually-hidden" id="announcer" aria-live="polite" />
      </body>
    </html>
  );
}
