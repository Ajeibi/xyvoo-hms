import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listShopProducts } from "@/lib/shop/products";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import type { SiteSection } from "@/lib/store/site/schema";
import type { Storefront } from "@/lib/store/site/storefront";
import type { CarouselReview } from "./ReviewsCarousel";

export type SectionProps<T extends SiteSection["type"]> = {
  section: Extract<SiteSection, { type: T }>;
  storefront: Storefront;
  /** The first visible section carries the page's only <h1>. */
  isFirst: boolean;
};

export const sectionHref = (storefront: Storefront, path: string) => storeHref(storefront.basePath, path);

export type Tile = { key: string; label: string; path: string; imageUrl: string | null; imageAlt: string | null; count: number | null };

/** Collections when the merchant has made some (or picked some), otherwise their product categories. */
export function buildTiles(storefront: Storefront, collectionIds: string[], max: number): Tile[] {
  const picked = collectionIds.length
    ? storefront.collections.filter((c) => collectionIds.includes(c.id))
    : storefront.collections.slice(0, max);
  if (picked.length) {
    return picked.slice(0, max).map((c) => ({
      key: c.id,
      label: c.name,
      path: STORE_PATHS.collection(c.slug),
      imageUrl: c.imageUrl,
      imageAlt: c.imageAlt,
      count: null,
    }));
  }
  return storefront.categories.slice(0, max).map((name) => ({
    key: name,
    label: name,
    path: STORE_PATHS.category(name),
    imageUrl: null,
    imageAlt: null,
    count: storefront.categoryCounts[name] ?? null,
  }));
}

export async function loadSectionProducts(section: Extract<SiteSection, { type: "product-list" }>, storefront: Storefront) {
  const { products } = await listShopProducts(storefront.tenant.id, {
    flag: section.source === "collection" ? undefined : section.source,
    collectionId: section.source === "collection" ? section.collectionId ?? undefined : undefined,
    sort: section.source === "featured" ? "featured" : "newest",
    pageSize: section.limit,
  });
  return products;
}

/** The store's latest well-rated written reviews, for the homepage strip. */
export async function loadHomeReviews(storefront: Storefront): Promise<CarouselReview[]> {
  const { data } = await createServerSupabaseClient()
    .schema("store")
    .from("product_reviews")
    .select("id, customer_name, rating, title, comment")
    .eq("tenant_id", storefront.tenant.id)
    .gte("rating", 4)
    .not("comment", "is", null)
    .order("created_at", { ascending: false })
    .limit(9);

  return (data || []).map((r) => ({
    id: r.id as string,
    name: r.customer_name as string,
    rating: r.rating as number,
    title: r.title as string | null,
    comment: r.comment as string,
  }));
}

export const itemCountLabel = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;
