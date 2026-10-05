import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductListing, { parseListingQuery, type ListingQuery } from "@/components/storefront-theme/ProductListing";
import { STORE_PATHS } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<ListingQuery> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  const query = parseListingQuery(await searchParams);
  if (!storefront) return {};
  const title = storefront.site.content.shop.title || "Shop";
  return {
    title: query.category ? `${query.category} | ${title}` : title,
    description: storefront.site.content.shop.description || undefined,
    alternates: { canonical: query.category ? STORE_PATHS.category(query.category) : STORE_PATHS.products },
    // Search results and sorted copies of the listing shouldn't compete with it in search engines.
    robots: query.search || query.sort !== "newest" ? { index: false, follow: true } : undefined,
  };
}

export default async function StorefrontProductsPage({ params, searchParams }: Props) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) notFound();
  const shop = storefront.site.content.shop;

  return (
    <ProductListing
      storefront={storefront}
      title={shop.title || "All products"}
      lead={shop.lead}
      listingPath={STORE_PATHS.products}
      query={parseListingQuery(await searchParams)}
    />
  );
}
