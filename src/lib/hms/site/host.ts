import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreSlugFromHost } from "@/lib/store/subdomain";

/**
 * Which tenant a request's host belongs to. Stores and hotels both live at
 * <label>.getxyvoo.com; a hotel's website address (hotel.sites) is looked up first and
 * anything else is a store, as before. The proxy runs this on every request, so answers
 * are kept for a short while instead of asking the database each time.
 */

export type HotelHostRecord = {
  /** The hotel's tenant slug, the /stay/<slug> route and the HMS URL. */
  slug: string;
  /** The website address (the label of <address>.getxyvoo.com). */
  address: string;
  published: boolean;
  /** Set when the label is an old address: the current address to redirect to. */
  movedTo: string | null;
};

export type SiteHost = { kind: "store"; slug: string } | ({ kind: "hotel" } & HotelHostRecord);

/**
 * What identifies a site by its host. Today only the <label>.getxyvoo.com label; a custom
 * domain (www.thegrandhotel.com) becomes `{ domain }` with its own branch in the lookup,
 * and nothing that calls resolveSiteHost has to change.
 */
export type HostKey = { label: string };
export type HotelHostLookup = (key: HostKey) => Promise<HotelHostRecord | null>;

const slugOf = (tenant: { subdomain: string | null; name: string | null } | null) => (tenant?.subdomain || tenant?.name || "").toLowerCase();

export const lookupHotelByHost: HotelHostLookup = async ({ label }) => {
  const db = createServerSupabaseClient();
  const hotel = db.schema("hotel");

  const { data: site, error } = await hotel.from("sites").select("tenant_id, address, published").eq("address", label).maybeSingle();
  if (error) throw new Error(error.message);
  if (site) {
    const { data: tenant } = await db.from("tenants").select("subdomain, name").eq("id", site.tenant_id).maybeSingle();
    const slug = slugOf(tenant);
    return slug ? { slug, address: site.address as string, published: Boolean(site.published), movedTo: null } : null;
  }

  // An old address that still redirects to the hotel's current one.
  const { data: moved } = await hotel
    .from("site_address_redirects")
    .select("tenant_id")
    .eq("old_address", label)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!moved) return null;
  const [{ data: current }, { data: tenant }] = await Promise.all([
    hotel.from("sites").select("address, published").eq("tenant_id", moved.tenant_id).maybeSingle(),
    db.from("tenants").select("subdomain, name").eq("id", moved.tenant_id).maybeSingle(),
  ]);
  const slug = slugOf(tenant);
  return current?.address && slug ? { slug, address: current.address as string, published: Boolean(current.published), movedTo: current.address as string } : null;
};

/** How long a host's answer is kept. A new address or publish takes at most this long to reach every instance. */
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 500;

export function createSiteHostResolver(lookup: HotelHostLookup, options: { ttlMs?: number; now?: () => number } = {}) {
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { record: HotelHostRecord | null; expires: number }>();

  async function hotelFor(label: string) {
    const hit = cache.get(label);
    if (hit && hit.expires > now()) return hit.record;
    // A failed lookup is not remembered, and the label is treated as a store, which is what it was before hotels.
    const record = await lookup({ label }).catch(() => undefined);
    if (record === undefined) return null;
    if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    cache.set(label, { record, expires: now() + ttlMs });
    return record;
  }

  return {
    /** The store or hotel a host belongs to, or null when it isn't one of our subdomains. */
    async resolve(host: string | null): Promise<SiteHost | null> {
      const label = getStoreSlugFromHost(host);
      if (!label) return null;
      const hotel = await hotelFor(label);
      return hotel ? { kind: "hotel", ...hotel } : { kind: "store", slug: label };
    },
    clear: () => cache.clear(),
  };
}

const resolver = createSiteHostResolver(lookupHotelByHost);

export const resolveSiteHost = resolver.resolve;
/** Called when a hotel publishes or changes its address, so this instance doesn't wait out the cache. */
export const clearSiteHostCache = resolver.clear;
