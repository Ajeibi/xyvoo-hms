import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DepartmentLoginSummary = {
  departmentRole: string;
  email: string;
  fullName: string;
  userId: string;
};

async function loadDepartmentLoginsForTenant(tenantId: string): Promise<DepartmentLoginSummary[]> {
  const service = createServerSupabaseClient();
  const { data: memberships } = await service
    .schema("hotel")
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["admin", "staff"]);

  if (!memberships?.length) return [];

  const logins = await Promise.all(
    memberships.map(async (membership) => {
      const { data, error } = await service.auth.admin.getUserById(membership.user_id);
      if (error || !data.user) return null;

      const departmentRole = data.user.user_metadata?.department_role;
      if (typeof departmentRole !== "string" || !departmentRole.trim()) return null;

      const fullName = data.user.user_metadata?.full_name;
      return {
        departmentRole,
        email: data.user.email ?? "",
        fullName: typeof fullName === "string" && fullName.trim() ? fullName.trim() : departmentRole,
        userId: data.user.id,
      } satisfies DepartmentLoginSummary;
    }),
  );

  return logins.filter((login): login is DepartmentLoginSummary => Boolean(login));
}

export async function getDepartmentLoginsForTenant(tenantId: string): Promise<DepartmentLoginSummary[]> {
  return loadDepartmentLoginsForTenant(tenantId);
}

export async function getDepartmentLoginsBySlug(slug: string): Promise<DepartmentLoginSummary[]> {
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return [];
  return getDepartmentLoginsForTenant(tenant.id);
}

export async function getDepartmentLoginRolesForTenant(tenantId: string): Promise<string[]> {
  const logins = await loadDepartmentLoginsForTenant(tenantId);
  return [...new Set(logins.map((login) => login.departmentRole))];
}

export async function getDepartmentLoginRolesBySlug(slug: string): Promise<string[]> {
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return [];

  return getDepartmentLoginRolesForTenant(tenant.id);
}
