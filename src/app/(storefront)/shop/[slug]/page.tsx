import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomeSections from "@/components/storefront-theme/sections";
import { getStorefront } from "@/lib/store/site/storefront";

// Resolves against the store's subdomain (metadataBase in the layout).
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function StorefrontHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) notFound();

  const { profile, site, storeName, siteUrl } = storefront;
  const sameAs = Object.values(profile.socials).filter((url): url is string => Boolean(url && /^https:\/\//.test(url)));
  // Store details for search engines; only fields the merchant has actually filled in.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: storeName,
    url: siteUrl,
    ...(site.seo.description ? { description: site.seo.description } : {}),
    ...(site.brand.logoUrl ? { logo: site.brand.logoUrl } : {}),
    ...(profile.businessEmail ? { email: profile.businessEmail } : {}),
    ...(profile.phone ? { telephone: profile.phone } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <HomeSections storefront={storefront} />
    </>
  );
}
