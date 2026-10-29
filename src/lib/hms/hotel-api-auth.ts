import { getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getDepartmentScopeDefinition, hasFullHotelAccess, type HmsSectionKey } from "@/lib/hms/department-access";

export async function requireHotelApiMember(slug: string) {
  const user = await getSessionUser();
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

  if (!membership) return { error: "Forbidden" as const, status: 403 as const };

  const departmentRole =
    typeof user.user_metadata?.department_role === "string"
      ? (user.user_metadata.department_role as string)
      : null;

  return { user, tenant, service, role: membership.role as string, departmentRole };
}

/** Who may use guest bills (folios), check-out and deposits: the front desk, reservations and Accounts. */
export const FOLIO_SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations", "accounts"];

/**
 * A hotel member whose role reaches one of these sections, the same rule the screens use:
 * owners and full-access admins reach everything; department staff only their department's
 * sections. Without this, anyone in the hotel could call a route a screen hides from them.
 */
export async function requireHotelApiSection(slug: string, sections: HmsSectionKey[] = FOLIO_SECTIONS) {
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return auth;
  if (hasFullHotelAccess(auth.role, auth.departmentRole)) return auth;
  const allowed = getDepartmentScopeDefinition(auth.departmentRole)?.allowedSections ?? [];
  if (!sections.some((s) => allowed.includes(s))) {
    return { error: "Your role can't use guest bills. Ask a manager if you need to." as const, status: 403 as const };
  }
  return auth;
}
