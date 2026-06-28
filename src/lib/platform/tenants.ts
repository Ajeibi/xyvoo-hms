import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  HotelProfileDirectoryRow,
  HotelRegistrationSessionRow,
  HotelTenantListRow,
  PlatformTenant,
} from "@/types";

export type { PlatformTenant };

export async function getPlatformTenants(): Promise<PlatformTenant[]> {
  const supabase = createServerSupabaseClient();
  const { data: tenantRows, error: tenantError } = await supabase
    .from("tenants")
    .select("id, subdomain, name, display_name")
    .eq("product", "hotel")
    .order("created_at", { ascending: false });

  if (tenantError || !tenantRows?.length) return [];

  const tenants = tenantRows as HotelTenantListRow[];
  const tenantIds = tenants.map((t) => t.id);

  const [{ data: profileRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .schema("hotel")
      .from("profiles")
      .select("tenant_id, contact_name, city, country, room_count, trial_ends_at")
      .in("tenant_id", tenantIds),
    supabase
      .schema("hotel")
      .from("registration_sessions")
      .select("tenant_id, contact_email, metadata, created_at")
      .in("tenant_id", tenantIds)
      .order("created_at", { ascending: false }),
  ]);

  const profileByTenant = new Map<string, HotelProfileDirectoryRow>();
  for (const p of ((profileRows || []) as HotelProfileDirectoryRow[])) {
    if (!profileByTenant.has(p.tenant_id)) profileByTenant.set(p.tenant_id, p);
  }

  const sessionByTenant = new Map<string, HotelRegistrationSessionRow>();
  for (const s of ((sessionRows || []) as HotelRegistrationSessionRow[])) {
    if (!sessionByTenant.has(s.tenant_id)) sessionByTenant.set(s.tenant_id, s);
  }

  return tenants.map((tenant) => {
    const profile = profileByTenant.get(tenant.id);
    const session = sessionByTenant.get(tenant.id);
    const activeTrial = Boolean(profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date());

    return {
      id: tenant.id,
      hotel_name: tenant.display_name || tenant.name || "Unnamed Hotel",
      slug: tenant.subdomain || tenant.name || tenant.id,
      status: activeTrial ? "active" : "pending",
      plan: session?.metadata?.billing_plan || null,
      room_count: profile?.room_count || null,
      city: profile?.city || null,
      country: profile?.country || null,
      contact_name: profile?.contact_name || null,
      contact_email: session?.contact_email || null,
      brand_primary_color: null,
    };
  });
}

export async function getPlatformTenantById(id: string): Promise<PlatformTenant | null> {
  const tenants = await getPlatformTenants();
  return tenants.find((t) => t.id === id) || null;
}
