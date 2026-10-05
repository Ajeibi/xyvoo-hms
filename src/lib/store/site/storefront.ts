import { cache } from "react";
import { headers } from "next/headers";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getShopTenantBySlug, type ShopTenant } from "@/lib/shop/tenants";
import { listShopCategories } from "@/lib/shop/products";
import { getStorePaymentRoute } from "@/lib/store/payments";
import { STOREFRONT_HOST_HEADER, storefrontUrl } from "@/lib/store/subdomain";
import { getStoreSite } from "./data";
import { menuItemPath } from "./links";
import { resolveSite, type ResolvedSite } from "./resolve";
import type { SiteNavigation } from "./schema";


export type StoreBusinessProfile = {
  businessEmail: string | null;
  phone: string | null;
  whatsapp: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  countryCode: string;
  currencyCode: string;
  socials: Partial<Record<"instagram" | "facebook" | "tiktok" | "x" | "youtube" | "pinterest", string>>;
};

export type StoreCollectionSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
};

export type StorePageSummary = { slug: string; title: string; systemKey: string | null };

export type Storefront = {
  slug: string;
  tenant: ShopTenant;
  storeName: string;
  site: ResolvedSite;
  /** Store-relative links are prefixed with this ("" on the store's subdomain). */
  basePath: string;
  /** Absolute URL of the store's home page on its subdomain, for canonical links, sitemaps and structured data. */
  siteUrl: string;
  /** The site has been published and is visible to the public. */
  isLive: boolean;
  /** A store member is viewing an unpublished site, so the draft is shown. */
  isPreview: boolean;
  /** The store can take card payments: a payout account through XYVOO, or its own Paystack keys. */
  acceptsPayments: boolean;
  profile: StoreBusinessProfile;
  collections: StoreCollectionSummary[];
  pages: StorePageSummary[];
  categories: string[];
  /** Number of visible products in each category. */
  categoryCounts: Record<string, number>;
};

async function isStoreMember(tenantId: string) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return false;

  const { data } = await createServerSupabaseClient()
    .schema("store")
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(data);
}

/** Drops menu links to pages or collections that don't exist (or aren't published), and empty footer columns. */
function pruneNavigation(nav: SiteNavigation, pages: StorePageSummary[], collections: StoreCollectionSummary[]): SiteNavigation {
  const pageSlugs = new Set(pages.map((p) => p.slug));
  const collectionSlugs = new Set(collections.map((c) => c.slug));
  const linkable = (item: SiteNavigation["header"][number]) => {
    if (!menuItemPath(item)) return false;
    if (item.type === "page") return pageSlugs.has(item.target);
    if (item.type === "collection") return collectionSlugs.has(item.target);
    return true;
  };

  return {
    ...nav,
    header: nav.header.filter(linkable),
    footer: nav.footer.map((col) => ({ ...col, items: col.items.filter(linkable) })).filter((col) => col.items.length > 0),
  };
}

/**
 * Everything a storefront page needs to render, loaded once per request.
 * Returns null when no store has this slug.
 */
export const getStorefront = cache(async (slug: string): Promise<Storefront | null> => {
  // The slug ends up inside a PostgREST .or() filter, so refuse anything that isn't a plain label.
  if (!/^[a-z0-9-]{1,63}$/i.test(slug)) return null;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return null;

  const db = createServerSupabaseClient().schema("store");
  const [siteRecord, profileResult, collectionsResult, pagesResult, categoriesResult, requestHeaders, paymentRoute] = await Promise.all([
    getStoreSite(tenant.id),
    db
      .from("business_profile")
      .select("business_email, phone, whatsapp, address_line1, address_line2, city, state, country_code, currency_code, socials")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    db
      .from("collections")
      .select("id, slug, name, description, image_url, image_alt")
      .eq("tenant_id", tenant.id)
      .eq("is_visible", true)
      .order("sort_order"),
    db.from("pages").select("slug, title, system_key").eq("tenant_id", tenant.id).eq("status", "published").order("sort_order"),
    listShopCategories(tenant.id),
    headers(),
    getStorePaymentRoute(tenant.id),
  ]);

  const isLive = siteRecord?.status === "live" && siteRecord.published !== null;
  const isPreview = !isLive && (await isStoreMember(tenant.id));
  const overrides = isPreview ? siteRecord?.draft ?? {} : siteRecord?.published ?? {};
  const storeName = tenant.displayName?.trim() || tenant.name?.trim() || slug;

  const collections: StoreCollectionSummary[] = (collectionsResult.data || []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    imageUrl: c.image_url,
    imageAlt: c.image_alt,
  }));
  const pages: StorePageSummary[] = (pagesResult.data || []).map((p) => ({ slug: p.slug, title: p.title, systemKey: p.system_key }));
  const categories = categoriesResult.map((c) => c.name);

  const resolved = resolveSite(siteRecord?.templateSlug, overrides, { storeName, tenantLogoUrl: tenant.logoUrl });
  const now = Date.now();
  const site: ResolvedSite = {
    ...resolved,
    navigation: pruneNavigation(resolved.navigation, pages, collections),
    // A promotion with a countdown disappears once it has ended.
    sections: resolved.sections.filter((s) => !(s.type === "promo" && s.endsAt && new Date(s.endsAt).getTime() < now)),
  };

  const p = profileResult.data;
  const profile: StoreBusinessProfile = {
    businessEmail: p?.business_email ?? null,
    phone: p?.phone ?? null,
    whatsapp: p?.whatsapp ?? null,
    addressLine1: p?.address_line1 ?? null,
    addressLine2: p?.address_line2 ?? null,
    city: p?.city ?? null,
    state: p?.state ?? null,
    countryCode: p?.country_code ?? "NG",
    currencyCode: p?.currency_code ?? "NGN",
    socials: (p?.socials as StoreBusinessProfile["socials"]) ?? {},
  };

  const onSubdomain = Boolean(requestHeaders.get(STOREFRONT_HOST_HEADER));
  const basePath = onSubdomain ? "" : `/shop/${slug}`;

  return {
    slug,
    tenant,
    storeName,
    site,
    basePath,
    // Always the subdomain, even when viewed at /shop/<slug>, so search engines
    // treat the subdomain as the one true address of every page.
    siteUrl: storefrontUrl(slug),
    isLive,
    isPreview,
    acceptsPayments: paymentRoute !== null,
    profile,
    collections,
    pages,
    categories,
    categoryCounts: Object.fromEntries(categoriesResult.map((c) => [c.name, c.count])),
  };
});
