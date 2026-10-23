import { createServerSupabaseClient } from "@/lib/supabase/server";
import { shopChanged } from "@/lib/store/site/shop-changed";
import { buildDefaultPages, type DefaultPagesContext } from "./default-pages";
import { mapDeliveryZone, type DeliveryZoneRow } from "./delivery";
import { availablePaymentMethods, parseOfflinePayments } from "./offline-payments";
import { getStorePaymentRoute } from "./payments";
import { toPageRow } from "./pages";
import { STORE_CATEGORIES, type StoreCategory } from "./site/templates";

/** Everything the default pages are written from, read from the shop's own records. */
async function loadContext(tenantId: string): Promise<DefaultPagesContext | null> {
  const db = createServerSupabaseClient();
  const store = db.schema("store");
  const [{ data: tenant }, { data: profile }, { data: zoneRows }, { data: products }, paymentRoute] = await Promise.all([
    db.from("tenants").select("name, display_name, subdomain").eq("id", tenantId).maybeSingle(),
    store.from("business_profile").select("*").eq("tenant_id", tenantId).maybeSingle(),
    store
      .from("delivery_zones")
      .select("id, name, regions, fee, weight_bands, free_over, eta_text, is_pickup, is_active, sort_order")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order"),
    store
      .from("products")
      .select("name, image_url, image_alt_texts")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .not("image_url", "is", null)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(4),
    getStorePaymentRoute(tenantId),
  ]);
  if (!tenant) return null;

  const p = (profile || {}) as Record<string, unknown>;
  const category = STORE_CATEGORIES.includes(p.category as StoreCategory) ? (p.category as StoreCategory) : null;
  return {
    storeName: ((tenant.display_name as string | null)?.trim() || String(tenant.name || tenant.subdomain)).trim(),
    category,
    categoryOther: (p.category_detail as string | null) ?? null,
    city: (p.city as string | null) ?? null,
    state: (p.state as string | null) ?? null,
    currency: (p.currency_code as string | null) || "NGN",
    email: (p.business_email as string | null) ?? null,
    phone: (p.phone as string | null) ?? null,
    whatsapp: (p.whatsapp as string | null) ?? null,
    deliveryOptions: ((zoneRows || []) as DeliveryZoneRow[]).map(mapDeliveryZone).map((z) => ({ name: z.name, fee: z.fee, freeOver: z.freeOver, etaText: z.etaText, isPickup: z.isPickup })),
    paymentMethods: availablePaymentMethods({
      acceptsCard: paymentRoute !== null,
      offline: parseOfflinePayments(p.offline_payments),
      whatsappNumber: (p.whatsapp as string | null) ?? null,
    }),
    images: (products || [])
      .filter((r) => typeof r.image_url === "string" && (r.image_url as string).startsWith("https://"))
      .map((r) => ({ url: r.image_url as string, alt: ((r.image_alt_texts as string[] | null)?.[0] || (r.name as string)).slice(0, 200) })),
  };
}

/**
 * Creates the shop's standard website pages (About, Contact, FAQs, Delivery
 * and returns, Privacy, Terms), published and written from its details.
 * Pages the shop already has, and web addresses already in use, are left
 * alone, so it's safe to run again. Returns the titles of pages it added.
 */
export async function ensureDefaultPages(tenantId: string): Promise<string[]> {
  const ctx = await loadContext(tenantId);
  if (!ctx) return [];
  const store = createServerSupabaseClient().schema("store");
  const { data: existing, error } = await store.from("pages").select("slug, system_key").eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  const haveKeys = new Set((existing || []).map((r) => r.system_key as string | null).filter(Boolean));
  const haveSlugs = new Set((existing || []).map((r) => r.slug as string));

  const toAdd = buildDefaultPages(ctx).filter((p) => !haveKeys.has(p.systemKey) && !haveSlugs.has(p.slug));
  if (!toAdd.length) return [];
  const start = existing?.length ?? 0;
  const { error: insertError } = await store.from("pages").insert(
    toAdd.map((p, i) => ({
      tenant_id: tenantId,
      system_key: p.systemKey,
      sort_order: start + i,
      ...toPageRow({ title: p.title, slug: p.slug, body: p.body, status: "published", showInMenu: p.showInMenu, seoTitle: p.seoTitle, seoDescription: p.seoDescription }),
    })),
  );
  if (insertError) throw new Error(insertError.message);
  shopChanged(tenantId);
  return toAdd.map((p) => p.title);
}
