import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreSite } from "./site/data";
import { getStorePaymentRoute } from "./payments";

/**
 * The dashboard's go-live checklist and publishing. A store can publish once
 * it has at least one product on sale and a way to take payment (decision D6),
 * so a published shop can always take an order. Delivery and collections are
 * recommended, not required.
 */

export type ChecklistItem = {
  key: "products" | "payments" | "delivery" | "collections" | "publish";
  label: string;
  description: string;
  done: boolean;
  required: boolean;
  /** Dashboard path (under /storefront/<slug>) where the merchant does this. */
  path: string;
};

export type GoLiveStatus = {
  items: ChecklistItem[];
  canPublish: boolean;
  status: "draft" | "live" | "paused";
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
};

export async function getGoLiveStatus(tenantId: string): Promise<GoLiveStatus> {
  const store = createServerSupabaseClient().schema("store");
  const [products, zones, collections, paymentRoute, site] = await Promise.all([
    store.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "active").eq("visibility", "visible"),
    store.from("delivery_zones").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
    store.from("collections").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    getStorePaymentRoute(tenantId),
    getStoreSite(tenantId),
  ]);

  const hasProducts = (products.count ?? 0) > 0;
  const hasPayments = paymentRoute !== null;
  const status = site?.status ?? "draft";
  const live = status === "live" && site?.published != null;
  const hasUnpublishedChanges = Boolean(site && JSON.stringify(site.draft) !== JSON.stringify(site.published ?? {}));

  const items: ChecklistItem[] = [
    { key: "products", label: "Add your first product", description: "Customers need something to buy.", done: hasProducts, required: true, path: "/products" },
    { key: "payments", label: "Add your payout account", description: "So customers can pay and you get paid.", done: hasPayments, required: true, path: "/payments" },
    { key: "delivery", label: "Set your delivery options", description: "What delivery costs, or if customers can collect.", done: (zones.count ?? 0) > 0, required: false, path: "/delivery" },
    { key: "collections", label: "Group products into collections", description: "Helps customers browse. Optional.", done: (collections.count ?? 0) > 0, required: false, path: "/collections" },
    { key: "publish", label: "Publish your shop", description: "Make your shop visible to customers.", done: live, required: true, path: "/dashboard" },
  ];

  return { items, canPublish: hasProducts && hasPayments, status, publishedAt: site?.publishedAt ?? null, hasUnpublishedChanges };
}

/** Makes the current draft the live site and keeps a copy of it as a numbered version. */
export async function publishSite(tenantId: string, userId: string) {
  const site = await getStoreSite(tenantId);
  if (!site) throw new Error("This store has no site record.");
  const store = createServerSupabaseClient().schema("store");
  const version = site.publishedVersion + 1;
  const now = new Date().toISOString();

  const { error: versionError } = await store
    .from("site_versions")
    .insert({ tenant_id: tenantId, version, template_slug: site.templateSlug, snapshot: site.draft, published_by: userId });
  if (versionError) throw new Error(versionError.message);

  const { error } = await store
    .from("sites")
    .update({ published: site.draft, status: "live", published_version: version, published_at: now, published_by: userId })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

/** Takes the shop offline (customers see "opening soon"); the published version is kept for republishing. */
export async function unpublishSite(tenantId: string) {
  const { error } = await createServerSupabaseClient().schema("store").from("sites").update({ status: "paused" }).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
