import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StoreTenant = {
  id: string;
  subdomain: string | null;
  name: string | null;
  display_name: string | null;
  logo_url: string | null;
};

export async function getStoreTenantBySlug(slug: string): Promise<StoreTenant | null> {
  const supabase = createServerSupabaseClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, subdomain, name, display_name, logo_url")
    .eq("product", "store")
    .or(`subdomain.eq.${slug},name.eq.${slug}`)
    .maybeSingle();

  return (tenant as StoreTenant | null) || null;
}
