import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { HotelMembershipRow, HotelTenantCore } from "@/types";
import { getDepartmentScopeDefinition, hasFullHotelAccess } from "@/lib/hms/department-access";

export function isPlatformAdminEmail(email?: string | null) {
  if (!email) return false;
  return email.toLowerCase().endsWith("@getxyvoo.com");
}

export async function getUserHotelDashboardPath(userId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();

  const { data: memberships } = await supabase
    .schema("hotel")
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const membership = (memberships as HotelMembershipRow[] | null)?.[0];
  if (!membership?.tenant_id) return null;

  const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(userId);
  const departmentRole =
    !userError && typeof userResult.user?.user_metadata?.department_role === "string"
      ? userResult.user.user_metadata.department_role
      : null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, subdomain, name")
    .eq("id", membership.tenant_id)
    .eq("product", "hotel")
    .maybeSingle();

  const tenantData = tenant as HotelTenantCore | null;
  if (!tenantData) return null;
  const slug = tenantData.subdomain || tenantData.name || tenantData.id;

  if (hasFullHotelAccess(membership.role ?? null, departmentRole)) {
    return `/hms/${slug}/dashboard`;
  }

  const departmentScope = getDepartmentScopeDefinition(departmentRole);
  if (departmentScope) {
    return departmentScope.homePath(slug);
  }

  return `/hms/${slug}/notifications`;
}

export async function getUserStoreDashboardPath(userId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();

  const { data: memberships } = await supabase
    .schema("store")
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const tenantId = (memberships as Array<{ tenant_id: string }> | null)?.[0]?.tenant_id;
  if (!tenantId) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, subdomain, name")
    .eq("id", tenantId)
    .eq("product", "store")
    .maybeSingle();

  const tenantData = tenant as { id: string; subdomain: string | null; name: string | null } | null;
  if (!tenantData) return null;

  const slug = tenantData.subdomain || tenantData.name || tenantData.id;
  return `/storefront/${slug}/dashboard`;
}
