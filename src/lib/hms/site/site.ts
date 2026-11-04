import { checkAddressAvailable } from "@/lib/address-namespace";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { storeSubdomainSchema } from "@/lib/store/subdomain";
import { ADDRESS_REDIRECT_DAYS, MAX_ADDRESS_CHANGES_PER_30_DAYS, type HotelTemplateId } from "./constants";
import { clearSiteHostCache } from "./host";

/**
 * A hotel's website record (hotel.sites), the addresses it used to have, and a log of changes.
 * A hotel with no record is "not set up".
 */

export type HotelSite = {
  tenantId: string;
  templateId: HotelTemplateId | null;
  address: string | null;
  published: boolean;
  reservationsEmail: string | null;
  publishedAt: string | null;
};

type SiteRow = {
  tenant_id: string;
  template_id: HotelTemplateId | null;
  address: string | null;
  published: boolean;
  reservations_email: string | null;
  published_at: string | null;
};

const SITE_COLUMNS = "tenant_id, template_id, address, published, reservations_email, published_at";

const toSite = (row: SiteRow): HotelSite => ({
  tenantId: row.tenant_id,
  templateId: row.template_id,
  address: row.address,
  published: row.published,
  reservationsEmail: row.reservations_email,
  publishedAt: row.published_at,
});

export async function getHotelSite(tenantId: string): Promise<HotelSite | null> {
  const { data, error } = await createServerSupabaseClient().schema("hotel").from("sites").select(SITE_COLUMNS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toSite(data as SiteRow) : null;
}

/**
 * Saves the template and/or reservations email, creating the record on first save. A new record starts with
 * the hotel's own slug as its address when that is free to use as one; otherwise the hotel chooses.
 */
export async function saveSiteSettings(tenant: { id: string; slug: string }, changes: { templateId?: HotelTemplateId; reservationsEmail?: string }) {
  const db = createServerSupabaseClient();
  const existing = await getHotelSite(tenant.id);
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.templateId !== undefined) row.template_id = changes.templateId;
  if (changes.reservationsEmail !== undefined) row.reservations_email = changes.reservationsEmail || null;

  if (existing) {
    const { error } = await db.schema("hotel").from("sites").update(row).eq("tenant_id", tenant.id);
    if (error) throw new Error(error.message);
  } else {
    const parsed = storeSubdomainSchema.safeParse(tenant.slug);
    const usable = parsed.success && (await checkAddressAvailable(parsed.data, tenant.id, db)).available;
    const { error } = await db
      .schema("hotel")
      .from("sites")
      .insert({ tenant_id: tenant.id, address: usable ? tenant.slug : null, ...row });
    if (error) throw new Error(error.message);
  }
  clearSiteHostCache();
  return (await getHotelSite(tenant.id))!;
}

export async function setSitePublished(tenantId: string, published: boolean) {
  const { error } = await createServerSupabaseClient()
    .schema("hotel")
    .from("sites")
    .update({ published, published_at: published ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  clearSiteHostCache();
}

export type PreviousAddress = { address: string; createdAt: string; expiresAt: string };

/** The hotel's old addresses that still redirect, newest first. */
export async function listPreviousAddresses(tenantId: string): Promise<PreviousAddress[]> {
  const { data, error } = await createServerSupabaseClient()
    .schema("hotel")
    .from("site_address_redirects")
    .select("old_address, created_at, expires_at")
    .eq("tenant_id", tenantId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({ address: r.old_address, createdAt: r.created_at, expiresAt: r.expires_at }));
}

export function addressChangesInLast30Days(previous: PreviousAddress[]) {
  const since = Date.now() - 30 * 86_400_000;
  return previous.filter((p) => new Date(p.createdAt).getTime() > since).length;
}

export const addressChangesLeft = (previous: PreviousAddress[]) => Math.max(0, MAX_ADDRESS_CHANGES_PER_30_DAYS - addressChangesInLast30Days(previous));

/** Moves the hotel's website to a new address and keeps the old one redirecting for 90 days. */
export async function changeSiteAddress(tenantId: string, oldAddress: string | null, newAddress: string) {
  const hotel = createServerSupabaseClient().schema("hotel");
  const { error } = await hotel.from("sites").update({ address: newAddress, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
  if (error) {
    // The unique index: someone took the address between the check and now.
    throw new Error(error.code === "23505" ? "That address is already taken." : error.message);
  }
  // Moving back to a recent address: it's the hotel's own again, so stop redirecting it.
  await hotel.from("site_address_redirects").delete().eq("old_address", newAddress).eq("tenant_id", tenantId);
  if (oldAddress) {
    const now = Date.now();
    const { error: redirectError } = await hotel.from("site_address_redirects").upsert({
      old_address: oldAddress,
      tenant_id: tenantId,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + ADDRESS_REDIRECT_DAYS * 86_400_000).toISOString(),
    });
    if (redirectError) throw new Error(redirectError.message);
  }
  clearSiteHostCache();
}

export type SiteActivityInput = {
  tenantId: string;
  actor: { userId: string | null; name: string };
  action: string;
  changes?: Record<string, { from: string | null; to: string | null }>;
};

/** Never throws: a log line that can't be written must not undo the change it describes. */
export async function logSiteActivity(input: SiteActivityInput) {
  try {
    const { error } = await createServerSupabaseClient()
      .schema("hotel")
      .from("site_activity")
      .insert({
        tenant_id: input.tenantId,
        actor_user_id: input.actor.userId,
        actor_name: input.actor.name.trim().slice(0, 120),
        action: input.action.toLowerCase().replace(/[^a-z_]/g, "_").slice(0, 40),
        changes: input.changes ?? {},
      });
    if (error) console.error("[hotel site] activity not logged", error.message);
  } catch (error) {
    console.error("[hotel site] activity not logged", error);
  }
}
