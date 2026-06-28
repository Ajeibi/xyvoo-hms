import { z } from "zod";
import { getDepartmentLoginsForTenant } from "@/lib/hms/department-logins";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CREATABLE_DEPARTMENT_ROLES } from "@/lib/hms/role-sections";

export const DepartmentRoleSchema = z.enum(CREATABLE_DEPARTMENT_ROLES as [string, ...string[]]);

export async function requireDepartmentLoginAdmin(slug: string) {
  const authClient = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return { error: "Unauthorized" as const, status: 401 as const };

  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return { error: "Tenant not found." as const, status: 404 as const };

  const service = createServerSupabaseClient();
  const { data: membership } = await service
    .schema("hotel")
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !isAdminLikeRole(membership.role)) {
    return { error: "Only owner/admin can manage department logins." as const, status: 403 as const };
  }

  return { user, tenant, service };
}

export async function findDepartmentLogin(tenantId: string, departmentRole: string) {
  const logins = await getDepartmentLoginsForTenant(tenantId);
  return logins.find((login) => login.departmentRole === departmentRole) ?? null;
}
