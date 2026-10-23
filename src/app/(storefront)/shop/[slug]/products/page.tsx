import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductListing, { listingCanonical, listingRobots, parseListingQuery, type ListingQuery } from "@/components/storefront-theme/ProductListing";
import { STORE_PATHS } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { getShopT } from "@/lib/store/i18n/server";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<ListingQuery> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  const query = parseListingQuery(await searchParams);
  if (!storefront) return {};
  const t = getShopT(storefront);
  const title = storefront.site.content.shop.title || t("listing.shop");
  // Any ?category= can be typed in; only the shop's real categories are pages worth indexing.
  const unknownCategory = Boolean(query.category && !storefront.categories.includes(query.category));
  const pageTitle = query.category ? `${query.category} | ${title}` : title;
  return {
    title: query.page > 1 ? t("listing.titleWithPage", { title: pageTitle, page: query.page }) : pageTitle,
    // Search results show a description for every page, so there's always one, even before the merchant writes their own.
    description:
      storefront.site.content.shop.description ||
      (query.category
        ? t("listing.categoryDescription", { category: query.category, store: storefront.storeName })
        : t("listing.shopDescription", { store: storefront.storeName })),
    alternates: { canonical: listingCanonical(query.category ? STORE_PATHS.category(query.category) : STORE_PATHS.products, query.page) },
    robots: listingRobots(query, unknownCategory),
  };
}

export default async function StorefrontProductsPage({ params, searchParams }: Props) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) notFound();
  const shop = storefront.site.content.shop;

  return (
    <ProductListing
      storefront={storefront}
      title={shop.title || getShopT(storefront)("listing.allProducts")}
      lead={shop.lead}
      listingPath={STORE_PATHS.products}
      query={parseListingQuery(await searchParams)}
    />
  );
}
