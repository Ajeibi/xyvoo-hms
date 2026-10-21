import { revalidateTag } from "next/cache";

/** The cache tag for a shop's shared data (see shop-cache.ts). */
export const shopTag = (tenantId: string) => `shop:${tenantId}`;

/**
 * Call after any change shoppers would see on the shop: publishing or pausing
 * it, its template, contact details, ways to pay, currencies, collections,
 * pages, or products (their categories). The next page view reads fresh.
 * Never throws: a cache that can't be cleared here still runs out within a minute.
 */
export function shopChanged(tenantId: string) {
  try {
    revalidateTag(shopTag(tenantId), { expire: 0 });
  } catch (err) {
    console.error("[shop-cache] not cleared", { tenantId, err });
  }
}
