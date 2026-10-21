import { unstable_cache } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listShopCategories } from "@/lib/shop/products";
import { getStoreSite, type StoreSiteRecord } from "./data";
import { shopTag } from "./shop-changed";

/*
 * What every page of a shop shows that's the same for every shopper: the
 * published site, contact details, collections, pages and categories. It's
 * kept between visits rather than read from the database on every page view,
 * and cleared the moment the merchant changes any of it (shopChanged in
 * shop-changed.ts).
 *
 * Left out on purpose: the tenant lookup (a renamed address must work at
 * once), the payment route (it holds secret keys), the plan (billing screens
 * need it exact), and anything a merchant previewing a draft sees, which is
 * always read fresh.
 */

/** A safety net: if a change somewhere doesn't clear the cache, it's never more than this out of date. */
const SNAPSHOT_SECONDS = 60;

const PROFILE_COLUMNS = "business_email, phone, whatsapp, address_line1, address_line2, city, state, country_code, currency_code, socials";

export type ShopProfileRow = {
  business_email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  currency_code: string | null;
  socials: unknown;
  offline_payments?: unknown;
  currencies?: unknown;
};

export type ShopSnapshot = {
  site: StoreSiteRecord | null;
  profile: ShopProfileRow | null;
  collections: Array<{ id: string; slug: string; name: string; description: string | null; image_url: string | null; image_alt: string | null }>;
  /** Every page, drafts included; the storefront picks what the viewer may see. */
  pages: Array<{ slug: string; title: string; system_key: string | null; status: string }>;
  categories: Array<{ name: string; count: number }>;
};

async function loadSnapshot(tenantId: string): Promise<ShopSnapshot> {
  const db = createServerSupabaseClient().schema("store");
  const profile = async () => {
    const full = await db.from("business_profile").select(`${PROFILE_COLUMNS}, offline_payments, currencies`).eq("tenant_id", tenantId).maybeSingle();
    // Before the offline payments and currencies columns exist, the shop still shows, without those options.
    if (!full.error) return full.data as ShopProfileRow | null;
    const basic = await db.from("business_profile").select(PROFILE_COLUMNS).eq("tenant_id", tenantId).maybeSingle();
    return basic.data as ShopProfileRow | null;
  };
  const [site, profileRow, collections, pages, categories] = await Promise.all([
    getStoreSite(tenantId),
    profile(),
    db.from("collections").select("id, slug, name, description, image_url, image_alt").eq("tenant_id", tenantId).eq("is_visible", true).order("sort_order"),
    db.from("pages").select("slug, title, system_key, status").eq("tenant_id", tenantId).order("sort_order"),
    listShopCategories(tenantId),
  ]);
  return {
    site,
    profile: profileRow,
    collections: (collections.data || []) as ShopSnapshot["collections"],
    pages: (pages.data || []) as ShopSnapshot["pages"],
    categories,
  };
}

/** The shop's shared data, from the cache when it's there. */
export function getShopSnapshot(tenantId: string) {
  return unstable_cache(() => loadSnapshot(tenantId), ["shop-snapshot-v1", tenantId], { tags: [shopTag(tenantId)], revalidate: SNAPSHOT_SECONDS })();
}
