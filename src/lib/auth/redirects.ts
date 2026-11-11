import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { HotelMembershipRow, HotelTenantCore } from "@/types";
import { getDepartmentScopeDefinition, hasFullHotelAccess } from "@/lib/hms/department-access";
import { getOnboardingProgress } from "@/lib/store/site/data";
import { effectiveDepartmentRole, readHotelMembership } from "@/lib/hms/membership-role";
import { getUserGroupHomePath } from "@/lib/hms/groups/group-access";

export function isPlatformAdminEmail(email?: string | null) {
  if (!email) return false;
  return email.toLowerCase().endsWith("@getxyvoo.com");
}

export async function getUserHotelDashboardPath(userId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();

  // Someone who runs a group of several hotels starts on the group overview.
  const groupPath = await getUserGroupHomePath(userId);
  if (groupPath) return groupPath;

  const { data: memberships } = await supabase
    .schema("hotel")
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(2);

  // A login that works at more than one hotel picks where to go.
  if ((memberships ?? []).length > 1) return "/hms-group";

  const membership = (memberships as HotelMembershipRow[] | null)?.[0];
  if (!membership?.tenant_id) return null;

  const [{ data: userResult, error: userError }, membershipRole] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    readHotelMembership(supabase, membership.tenant_id, userId),
  ]);
  const departmentRole = effectiveDepartmentRole(
    membershipRole?.departmentRole,
    userError ? null : (userResult.user?.user_metadata as Record<string, unknown> | undefined),
  );

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
  // Merchants who haven't finished setting up carry on where they left off.
  const progress = await getOnboardingProgress(tenantData.id);
  if (progress && !progress.completedAt) return `/storefront/${slug}/welcome/${progress.currentStep}`;
  return `/storefront/${slug}/dashboard`;
}
