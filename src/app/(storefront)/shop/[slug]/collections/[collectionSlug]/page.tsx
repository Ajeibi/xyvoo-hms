import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductListing, { parseListingQuery, type ListingQuery } from "@/components/storefront-theme/ProductListing";
import { STORE_PATHS } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

type Props = { params: Promise<{ slug: string; collectionSlug: string }>; searchParams: Promise<ListingQuery> };

async function load(params: Props["params"]) {
  const { slug, collectionSlug } = await params;
  const storefront = await getStorefront(slug);
  const collection = storefront?.collections.find((c) => c.slug === collectionSlug);
  return storefront && collection ? { storefront, collection } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  return {
    title: found.collection.name,
    description: found.collection.description || undefined,
    alternates: { canonical: STORE_PATHS.collection(found.collection.slug) },
  };
}

export default async function StorefrontCollectionPage({ params, searchParams }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const query = parseListingQuery(await searchParams);

  return (
    <ProductListing
      storefront={found.storefront}
      title={found.collection.name}
      lead={found.collection.description ?? undefined}
      listingPath={STORE_PATHS.collection(found.collection.slug)}
      query={{ ...query, category: undefined }}
      collectionId={found.collection.id}
      showCategories={false}
    />
  );
}
