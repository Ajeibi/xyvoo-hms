import "@/styles/storefront/base.css";
import "@/styles/storefront/themes.css";
import "@/styles/storefront/app.css";
import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Script from "next/script";
import AccountActivity from "@/components/storefront-theme/AccountActivity";
import AccountPrompt from "@/components/storefront-theme/AccountPrompt";
import ReferralCapture from "@/components/storefront-theme/ReferralCapture";
import PromoBar from "@/components/storefront-theme/PromoBar";
import StoreAnalytics from "@/components/storefront-theme/StoreAnalytics";
import StoreApp, { type StoreAppConfig } from "@/components/storefront-theme/StoreApp";
import StoreFooter from "@/components/storefront-theme/StoreFooter";
import StoreHeader, { type HeaderNavItem } from "@/components/storefront-theme/StoreHeader";
import { StorefrontProvider } from "@/components/storefront-theme/StorefrontProvider";
import { storeSocialLinks } from "@/components/storefront-theme/socials";
import { getFontPairing, googleFontCssUrl, uploadedFontFace, type FontPairing } from "@/lib/store/site/fonts";
import { menuItemPath, STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { fontVariableClasses } from "@/lib/store/site/next-fonts";
import { getStorefront, type Storefront } from "@/lib/store/site/storefront";
import { storeAppPath, storeAppScope } from "@/lib/store/app";
import { getPushPublicKey } from "@/lib/store/push";
import { hasShopFeature } from "@/lib/store/features";
import { countdownLabel } from "@/lib/store/discounts";
import { getPromoBanner } from "@/lib/store/discounts-server";
import { formatShopCurrency } from "@/lib/shop/format";
import { findSlugRedirect } from "@/lib/store/slugs";
import { movedStoreLocation, STOREFRONT_HOST_HEADER, STOREFRONT_PATH_HEADER, STOREFRONT_PREVIEW_PARAM } from "@/lib/store/subdomain";

/*
 * Root layout for every storefront page. It is its own root layout (no
 * platform layout above it), so stores load none of XYVOO's styles, fonts,
 * favicon or structured data: only the template's CSS and the merchant's brand.
 */

type LayoutParams = { params: Promise<{ slug: string }> };

// Swaps html.no-js for html.js before paint, as the static templates do, so
// menus and panels that need JavaScript stay usable without it. A plain inline
// script in <head>: next/script queues inline beforeInteractive code until the
// framework bundle has loaded, which painted the taller no-js header first and
// then shifted the whole page.
const ENHANCE_SCRIPT = `document.documentElement.classList.replace("no-js","js");if(window.self!==window.top)document.documentElement.classList.add("is-framed");`;

/**
 * Runs before the first paint. The cookie banner is in the page's HTML so it
 * shows at once (not after the scripts load); a visitor who has already chosen
 * gets this class, and the banner stays hidden for them without a flash.
 */
const consentScript = (slug: string) =>
  `try{var c=localStorage.getItem(${JSON.stringify(`sf-consent:${slug}`)});if(c==="accepted"||c==="rejected")document.documentElement.classList.add("sf-consent-chosen")}catch(e){}`;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

/**
 * Store fonts use display: optional (next-fonts.ts), so a font that is not
 * cached yet may not show on the first view. That is fine for customers, but
 * the website editor preview is how an owner sees a font they just chose: when
 * previewing, load the pairing and reload once if it was missing.
 */
function previewFontScript(pairing: FontPairing) {
  const faces = [`${pairing.display.weight} 1em "${pairing.display.family}"`, `400 1em "${pairing.body.family}"`];
  return `(function(){var f=${JSON.stringify(faces)},k="sf-font-reload:"+${JSON.stringify(pairing.id)};if(!document.fonts||f.every(function(x){return document.fonts.check(x)}))return;Promise.all(f.map(function(x){return document.fonts.load(x)})).then(function(){try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1")}catch(e){return}location.reload()})})();`;
}

/**
 * Where an old store address now lives, keeping the page path, when the store
 * changed its address in the last 90 days. A temporary redirect, not a
 * permanent one: once the 90 days are up another shop may claim the address,
 * and browsers never forget a permanent redirect.
 */
async function movedStoreUrl(oldSlug: string): Promise<string | null> {
  if (!/^[a-z0-9-]{1,63}$/i.test(oldSlug)) return null;
  const newSlug = await findSlugRedirect(oldSlug);
  if (!newSlug) return null;

  const requestHeaders = await headers();
  return movedStoreLocation({
    oldSlug,
    newSlug,
    path: requestHeaders.get(STOREFRONT_PATH_HEADER),
    host: requestHeaders.get("host"),
    subdomainSlug: requestHeaders.get(STOREFRONT_HOST_HEADER),
    protocol: requestHeaders.get("x-forwarded-proto"),
  });
}

export async function generateMetadata({ params }: LayoutParams): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) return { title: "Shop not found | XYVOO", robots: { index: false, follow: false } };
  const { seo, brand } = storefront.site;
  const icon = brand.faviconUrl || brand.logoUrl;

  return {
    // Relative canonical paths on each page resolve against the store's subdomain.
    metadataBase: new URL(storefront.siteUrl),
    title: { default: seo.title, template: `%s | ${storefront.storeName}` },
    // Search results show this under the store's name; until the merchant writes one, say what the site is.
    description: seo.description || `Shop online at ${storefront.storeName}.`,
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

/** The store's privacy page, if it has published one (linked from the cookie banner). */
function privacyPageHref(storefront: Storefront) {
  const page = storefront.pages.find((p) => p.systemKey === "privacy");
  return page ? storeHref(storefront.basePath, STORE_PATHS.page(page.slug)) : null;
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
  if (!storefront) {
    const moved = await movedStoreUrl(slug);
    if (moved) redirect(moved);
    // No shop here. Calling notFound() in a root layout skips every not-found
    // page and shows Next's bare 404, so render an empty document instead: the
    // page's own notFound() then shows the branded "no shop at this address"
    // page (not-found.tsx) with a 404 status.
    return (
      <html lang="en-GB">
        <body>{children}</body>
      </html>
    );
  }

  const { site, basePath, storeName } = storefront;
  const showMark = site.template.slug === "loftwood";
  const visible = storefront.isLive || storefront.isPreview;
  const fontPairing = getFontPairing(site.theme.fontPairing);
  const customFont = site.theme.customFont ?? null;
  // The feature check and the promotion banner don't depend on each other, so they're read together.
  const [canPush, promo] = await Promise.all([
    hasShopFeature(storefront.tenant.id, "pushNotifications"),
    visible ? getPromoBanner(storefront.tenant.id, (n) => formatShopCurrency(n, storefront.profile.currencyCode)).catch(() => null) : null,
  ]);
  // Published shops are installable apps. Drafts aren't. Only Standard shops offer notifications.
  const appConfig: StoreAppConfig | null =
    storefront.isLive && !storefront.isPreview
      ? {
          slug,
          storeName,
          swUrl: storeAppPath(basePath, "sw.js"),
          scope: storeAppScope(basePath),
          pushPublicKey: canPush ? getPushPublicKey() : null,
        }
      : null;

  const promoLabel = promo ? countdownLabel(promo.endsAt, new Date()) : null;

  return (
    <html
      lang="en"
      className={`no-js ${fontVariableClasses(fontPairing)}`}
      data-template={site.template.slug}
      style={site.cssVariables as CSSProperties}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: ENHANCE_SCRIPT + consentScript(slug) }} />
        {customFont?.source === "google" ? (
          <>
            {/* The merchant chose a Google Font, so this is the one font a shop loads from outside XYVOO. */}
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={googleFontCssUrl(customFont.family, customFont.hasBold)} />
          </>
        ) : null}
        {uploadedFontFace(customFont) ? <style dangerouslySetInnerHTML={{ __html: uploadedFontFace(customFont)! }} /> : null}
        {appConfig ? (
          <>
            <link rel="manifest" href={storeAppPath(basePath, "manifest.webmanifest")} />
            <link rel="apple-touch-icon" href={storeAppPath(basePath, "app-icon/apple")} />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-title" content={storeName} />
          </>
        ) : null}
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        {storefront.isPreview ? (
          <Script id="sf-preview-fonts" strategy="afterInteractive">
            {previewFontScript(fontPairing)}
          </Script>
        ) : null}

        {storefront.isPreview ? (
          <div className="preview-bar" role="note">
            {storefront.isLive ? (
              <>
                You&rsquo;re previewing changes customers can&rsquo;t see yet.{" "}
                <a href={`/shop/${slug}?${STOREFRONT_PREVIEW_PARAM}=0`}>See the live shop</a>
              </>
            ) : (
              <>
                You&rsquo;re previewing your unpublished shop. Customers can&rsquo;t see it yet.{" "}
                <a href={`${APP_URL}/storefront/${slug}/dashboard`}>Back to your dashboard</a>
              </>
            )}
          </div>
        ) : null}

        {visible ? (
          <StorefrontProvider
            value={{
              slug,
              basePath,
              currency: storefront.profile.currencyCode,
              currencies: storefront.currencies,
              displayCurrency: storefront.displayCurrency,
              whatsappOrdering: storefront.paymentMethods.includes("whatsapp"),
            }}
          >
            {promo && promoLabel ? <PromoBar offer={promo.offer} code={promo.code} endsAt={promo.endsAt} initialLabel={promoLabel} /> : null}
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
            <StoreFooter storefront={storefront} showMark={showMark} appConfig={appConfig} />
            {appConfig ? <StoreApp config={appConfig} variant="prompt" /> : null}
            {appConfig ? (
              <StoreAnalytics
                slug={slug}
                storeName={storeName}
                privacyHref={privacyPageHref(storefront)}
                pixels={{ metaPixelId: site.seo.metaPixelId, googleAnalyticsId: site.seo.googleAnalyticsId }}
              />
            ) : null}
            {appConfig ? <AccountPrompt storeName={storeName} privacyHref={privacyPageHref(storefront)} /> : null}
            {appConfig ? <AccountActivity /> : null}
            {appConfig ? <ReferralCapture /> : null}
          </StorefrontProvider>
        ) : (
          <OpeningSoon storefront={storefront} />
        )}

        <div className="visually-hidden" id="announcer" aria-live="polite" />
      </body>
    </html>
  );
}
