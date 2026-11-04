import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isReservedSubdomain } from "@/lib/store/subdomain";

/**
 * Stores and hotels share one set of web addresses (<label>.getxyvoo.com), so a label
 * can belong to only one of them. Every address change, from either product, asks here.
 */

export type AddressCheck = { available: true } | { available: false; reason: string };

/**
 * Whether `ownTenantId` (null for a tenant that doesn't exist yet) can use this label: not
 * reserved, not another tenant's name or subdomain, not a hotel's website address, and not
 * an old address of a store or hotel that still redirects. `label` must already have passed
 * storeSubdomainSchema (it goes into a PostgREST filter).
 */
export async function checkAddressAvailable(label: string, ownTenantId: string | null, db: SupabaseClient = createServerSupabaseClient()): Promise<AddressCheck> {
  if (isReservedSubdomain(label)) return { available: false, reason: "That address is reserved. Please choose another." };

  const now = new Date().toISOString();
  const notOwn = <T extends { neq: (column: string, value: string) => T }>(query: T) => (ownTenantId ? query.neq("tenant_id", ownTenantId) : query);

  let tenants = db.from("tenants").select("id").or(`subdomain.eq.${label},name.eq.${label}`).limit(1);
  if (ownTenantId) tenants = tenants.neq("id", ownTenantId);

  const [taken, hotelSite, storeRedirect, hotelRedirect] = await Promise.all([
    tenants,
    notOwn(db.schema("hotel").from("sites").select("tenant_id").eq("address", label).limit(1)),
    db.schema("store").from("slug_redirects").select("tenant_id").eq("old_slug", label).gt("expires_at", now).maybeSingle(),
    db.schema("hotel").from("site_address_redirects").select("tenant_id").eq("old_address", label).gt("expires_at", now).maybeSingle(),
  ]);

  // A failed lookup must not read as "free".
  const failed = [taken, hotelSite, storeRedirect, hotelRedirect].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  if (taken.data?.length || hotelSite.data?.length)return { available: false, reason: "That address is already taken." };
  if (storeRedirect.data && storeRedirect.data.tenant_id !== ownTenantId) {
    return { available: false, reason: "That address was used by another shop recently. Please choose another." };
  }
  if (hotelRedirect.data && hotelRedirect.data.tenant_id !== ownTenantId) {
    return { available: false, reason: "That address was used by another business recently. Please choose another." };
  }
  return { available: true };
}
