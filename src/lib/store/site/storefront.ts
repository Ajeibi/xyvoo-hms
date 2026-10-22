import { cache } from "react";
import { simulatedPaymentsEnabled } from "@/lib/payments/simulated";
import { cookies, headers } from "next/headers";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ShopTenant } from "@/lib/shop/tenants";
import { currencyForVisitorCountry, parseCurrencySettings, resolveDisplayCurrencies, shopCurrencyCookie, type DisplayCurrency } from "@/lib/store/currencies";
import { getFxRates } from "@/lib/store/fx-rates";
import { hasShopFeature } from "@/lib/store/features";
import { releaseExpiredOrdersSoon } from "@/lib/store/release-orders";
import type { StoreSocials } from "@/lib/store/socials";
import { availablePaymentMethods, parseOfflinePayments, type CheckoutPaymentMethod } from "@/lib/store/offline-payments";
import { STOREFRONT_HOST_HEADER, STOREFRONT_PREVIEW_COOKIE, storefrontUrl } from "@/lib/store/subdomain";
import { pickShopLanguage, shopLanguageCookie, shopLanguages, STOREFRONT_LANG_HEADER, type ShopLanguage } from "@/lib/store/i18n/languages";
import { setProductLanguage } from "@/lib/shop/product-translations";
import { getStoreSite } from "./data";
import { getCachedShopTenant, getShopSnapshot, type ShopSnapshot } from "./shop-cache";

type StoreSnapshotPage = ShopSnapshot["pages"][number];
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
  socials: StoreSocials;
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
  /** How shoppers can pay at checkout: card (when payments are set up) and the shop's offline options. */
  paymentMethods: CheckoutPaymentMethod[];
  profile: StoreBusinessProfile;
  /** Currencies shoppers can see prices in, home currency first. */
  currencies: DisplayCurrency[];
  /** The currency this shopper sees: their earlier choice, else their country's, else the home currency. */
  displayCurrency: string;
  /** Languages the shop is shown in, its main one (what its own words are written in) first. */
  languages: ShopLanguage[];
  /** The language this shopper sees: ?lang= in the address, else their earlier choice, else the shop's own. */
  language: ShopLanguage;
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
    header: nav.header.filter(linkable).map((item) => (item.children ? { ...item, children: item.children.filter(linkable) } : item)),
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
  const tenant = await getCachedShopTenant(slug);
  if (!tenant) return null;
  // Puts back stock held by abandoned or failed card payments before the shop is shown.
  releaseExpiredOrdersSoon(tenant.id);

  // The shop's shared data comes from the cache (only whether it takes cards, never its payment keys).
  const [snapshot, requestHeaders] = await Promise.all([getShopSnapshot(tenant.id), headers()]);

  const isLive = snapshot.site?.status === "live" && snapshot.site.published !== null;
  // Members see the draft on an unpublished shop, or on a live one when they've
  // opened the editor's preview (which sets the preview cookie).
  const wantsDraft = (await cookies()).get(STOREFRONT_PREVIEW_COOKIE)?.value === "1";
  const isPreview = (!isLive || wantsDraft) && (await isStoreMember(tenant.id));
  // A merchant previewing sees their draft as it is this moment, never a cached copy.
  const [siteRecord, pageRows] = isPreview
    ? await Promise.all([
        getStoreSite(tenant.id),
        createServerSupabaseClient().schema("store").from("pages").select("slug, title, system_key, status").eq("tenant_id", tenant.id).order("sort_order").then((r) => r.data || []),
      ])
    : [snapshot.site, snapshot.pages];
  const overrides = isPreview ? siteRecord?.draft ?? {} : siteRecord?.published ?? {};
  const storeName = tenant.displayName?.trim() || tenant.name?.trim() || slug;
  const categoriesResult = snapshot.categories;

  const collections: StoreCollectionSummary[] = snapshot.collections.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    imageUrl: c.image_url,
    imageAlt: c.image_alt,
  }));
  // Draft pages only exist for members previewing the shop.
  const pages: StorePageSummary[] = (pageRows as StoreSnapshotPage[])
    .filter((p) => p.status === "published" || isPreview)
    .map((p) => ({ slug: p.slug, title: p.title, systemKey: p.system_key }));
  const categories = categoriesResult.map((c) => c.name);

  const resolved = resolveSite(siteRecord?.templateSlug, overrides, { storeName, tenantLogoUrl: tenant.logoUrl });
  const now = Date.now();
  // A promotion with a countdown disappears once it has ended.
  const current = (list: ResolvedSite["sections"]) => list.filter((s) => !(s.type === "promo" && s.endsAt && new Date(s.endsAt).getTime() < now));
  const site: ResolvedSite = {
    ...resolved,
    navigation: pruneNavigation(resolved.navigation, pages, collections),
    sections: current(resolved.sections),
    productSections: current(resolved.productSections),
    collectionSections: current(resolved.collectionSections),
  };

  const p = snapshot.profile;
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

  // Other currencies are a Standard feature: on Free the shop shows only its own (the saved list is kept).
  const multiCurrency = await hasShopFeature(tenant.id, "multiCurrency");
  const currencySettings = multiCurrency ? parseCurrencySettings(p?.currencies, profile.currencyCode) : { extra: [] };
  // Only shops showing other currencies need the exchange rates.
  const rates = currencySettings.extra.length ? (await getFxRates()).rates : {};
  const currencies = resolveDisplayCurrencies(profile.currencyCode, currencySettings, rates);
  const chosen = (await cookies()).get(shopCurrencyCookie(slug))?.value;
  const visitorCurrency = currencyForVisitorCountry(requestHeaders.get("x-vercel-ip-country"));
  const displayCurrency =
    [chosen, visitorCurrency].find((code) => code && currencies.some((c) => c.code === code)) ?? profile.currencyCode;

  const languages = shopLanguages(site.content.language, site.content.languages);
  const language = pickShopLanguage(languages, requestHeaders.get(STOREFRONT_LANG_HEADER), (await cookies()).get(shopLanguageCookie(slug))?.value);
  // Products on this page come in that language where the merchant has translated them.
  setProductLanguage(tenant.id, language, languages[0]);

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
    acceptsPayments: snapshot.acceptsCard,
    paymentMethods: availablePaymentMethods({ acceptsCard: snapshot.acceptsCard || simulatedPaymentsEnabled(), offline: parseOfflinePayments(p?.offline_payments), whatsappNumber: p?.whatsapp ?? null }),
    profile,
    currencies,
    displayCurrency,
    languages,
    language,
    collections,
    pages,
    categories,
    categoryCounts: Object.fromEntries(categoriesResult.map((c) => [c.name, c.count])),
  };
});
