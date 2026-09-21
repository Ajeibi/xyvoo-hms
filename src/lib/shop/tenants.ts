import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Platform-wide fallback currency when a tenant hasn't set one on any product. */
export const DEFAULT_SHOP_CURRENCY = "NGN";

export type ShopTenant = {
  id: string;
  subdomain: string | null;
  name: string | null;
  displayName: string | null;
  logoUrl: string | null;
  paystackEnabled: boolean;
};

export type TenantPaystackSetup = {
  enabled: boolean;
  mode: "test" | "live";
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
};

type PaystackSetup = { enabled?: boolean } | null;

/**
 * Public tenant lookup for the unauthenticated shopper-facing site --
 * mirrors getStoreTenantBySlug (src/lib/store/tenants.ts) but carries no
 * membership check, since anyone can browse a store's catalog.
 */
export async function getShopTenantBySlug(slug: string): Promise<ShopTenant | null> {
  const supabase = createServerSupabaseClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, subdomain, name, display_name, logo_url, paystack_setup")
    .eq("product", "store")
    .or(`subdomain.eq.${slug},name.eq.${slug}`)
    .maybeSingle();

  if (!tenant) return null;

  const paystackSetup = tenant.paystack_setup as PaystackSetup;

  return {
    id: tenant.id,
    subdomain: tenant.subdomain,
    name: tenant.name,
    displayName: tenant.display_name,
    logoUrl: tenant.logo_url,
    paystackEnabled: Boolean(paystackSetup?.enabled),
  };
}

/** Full Paystack config including the secret key -- deliberately kept out of
 * ShopTenant/getShopTenantBySlug (which is used to render public pages) and
 * only fetched here, server-side, by the checkout/verify/webhook routes
 * that actually need to call Paystack with it. */
export async function getTenantPaystackSetup(tenantId: string): Promise<TenantPaystackSetup | null> {
  const supabase = createServerSupabaseClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("paystack_setup")
    .eq("id", tenantId)
    .maybeSingle();

  const setup = tenant?.paystack_setup as Partial<TenantPaystackSetup> | null;
  if (!setup || !setup.enabled || !setup.secretKey) return null;

  return {
    enabled: true,
    mode: setup.mode === "live" ? "live" : "test",
    publicKey: setup.publicKey || "",
    secretKey: setup.secretKey,
    webhookSecret: setup.webhookSecret || "",
  };
}

/** Resolves a tenant_id from OUR OWN payment_intents record for a given
 * Paystack reference -- used by the verify and webhook routes, which must
 * never trust a tenant id supplied by the caller/payload before the
 * transaction has been authenticated against Paystack. */
export async function getTenantIdByPaystackReference(reference: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .schema("store")
    .from("payment_intents")
    .select("tenant_id")
    .eq("paystack_reference", reference)
    .maybeSingle();

  return data?.tenant_id || null;
}
