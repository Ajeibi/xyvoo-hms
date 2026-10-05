import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isReservedSubdomain } from "@/lib/store/subdomain";

/**
 * Store web addresses (tenants.subdomain) and the old addresses that still
 * redirect after a change (store.slug_redirects, kept for 90 days).
 */

export type SlugCheck = { available: true } | { available: false; reason: string };

/**
 * Whether a store can use this address: not reserved, not another tenant's,
 * and not another store's recently changed address. `slug` must already have
 * passed storeSubdomainSchema (it goes into a PostgREST filter).
 */
export async function checkSlugAvailable(slug: string, ownTenantId: string | null, db: SupabaseClient = createServerSupabaseClient()): Promise<SlugCheck> {
  if (isReservedSubdomain(slug)) return { available: false, reason: "That address is reserved. Please choose another." };

  let tenants = db.from("tenants").select("id").or(`subdomain.eq.${slug},name.eq.${slug}`).limit(1);
  if (ownTenantId) tenants = tenants.neq("id", ownTenantId);
  const [taken, redirect] = await Promise.all([
    tenants,
    db.schema("store").from("slug_redirects").select("tenant_id").eq("old_slug", slug).gt("expires_at", new Date().toISOString()).maybeSingle(),
  ]);

  if (taken.data?.length) return { available: false, reason: "That address is already taken." };
  if (redirect.data && redirect.data.tenant_id !== ownTenantId) {
    return { available: false, reason: "That address was used by another shop recently. Please choose another." };
  }
  return { available: true };
}

/** The store an old address now points to, if it changed within the last 90 days. */
export async function findSlugRedirect(oldSlug: string): Promise<string | null> {
  const db = createServerSupabaseClient();
  const { data } = await db
    .schema("store")
    .from("slug_redirects")
    .select("tenant_id")
    .eq("old_slug", oldSlug.toLowerCase())
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  const { data: tenant } = await db.from("tenants").select("subdomain, name").eq("id", data.tenant_id).eq("product", "store").maybeSingle();
  return (tenant?.subdomain as string | null) || (tenant?.name as string | null) || null;
}

/** Moves a store to a new address and keeps the old one redirecting for 90 days. */
export async function changeStoreSlug(tenantId: string, oldSlug: string, newSlug: string) {
  const db = createServerSupabaseClient();
  const { error } = await db.from("tenants").update({ subdomain: newSlug, name: newSlug }).eq("id", tenantId);
  if (error) throw new Error(error.message);

  const store = db.schema("store");
  // Moving back to a recent address: it's the store's own again, so stop redirecting it.
  await store.from("slug_redirects").delete().eq("old_slug", newSlug).eq("tenant_id", tenantId);
  const { error: redirectError } = await store
    .from("slug_redirects")
    .upsert({ old_slug: oldSlug, tenant_id: tenantId, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString() });
  if (redirectError) throw new Error(redirectError.message);
}

export type PreviousAddress = { slug: string; createdAt: string; expiresAt: string };

/** A store's old addresses that still redirect, newest first. */
export async function listPreviousAddresses(tenantId: string): Promise<PreviousAddress[]> {
  const { data, error } = await createServerSupabaseClient()
    .schema("store")
    .from("slug_redirects")
    .select("old_slug, created_at, expires_at")
    .eq("tenant_id", tenantId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({ slug: r.old_slug, createdAt: r.created_at, expiresAt: r.expires_at }));
}

/** Address changes allowed in 30 days, so one store can't hold many names at once. */
export const MAX_SLUG_CHANGES_PER_30_DAYS = 3;

export function slugChangesInLast30Days(previous: PreviousAddress[]) {
  const since = Date.now() - 30 * 86_400_000;
  return previous.filter((p) => new Date(p.createdAt).getTime() > since).length;
}
