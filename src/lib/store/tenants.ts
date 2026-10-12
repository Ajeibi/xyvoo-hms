import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StoreTenant = {
  id: string;
  subdomain: string | null;
  name: string | null;
  display_name: string | null;
  logo_url: string | null;
};

export async function getStoreTenantBySlug(slug: string): Promise<StoreTenant | null> {
  // The slug goes into a PostgREST .or() filter, so only a plain label is allowed.
  if (!/^[a-z0-9-]{1,63}$/i.test(slug)) return null;
  const supabase = createServerSupabaseClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, subdomain, name, display_name, logo_url")
    .eq("product", "store")
    .or(`subdomain.eq.${slug},name.eq.${slug}`)
    .maybeSingle();

  return (tenant as StoreTenant | null) || null;
}
