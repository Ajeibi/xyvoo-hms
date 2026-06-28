import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import {
  getAdminAllowedSections,
  getAdminNavItems,
  getDepartmentScopeDefinition,
  hasFullHotelAccess,
  isAdminLikeRole,
  type HmsNavItem,
  type HmsSectionKey,
} from "@/lib/hms/department-access";

export type HmsAccessContext = {
  userId: string | null;
  role: string | null;
  departmentRole: string | null;
  isOwnerOrAdmin: boolean;
  canAccessAllDepartments: boolean;
  roleLabel: string;
  currentUserName: string;
  hotelDisplayName: string;
  logoUrl: string | null;
  homePath: string;
  settingsPath: string;
  navItems: HmsNavItem[];
  allowedSections: HmsSectionKey[];
};

export async function getHotelRoleAccess(slug: string) {
  const access = await getHmsAccessContext(slug);
  return {
    userId: access.userId,
    role: access.role,
    departmentRole: access.departmentRole,
    isOwnerOrAdmin: access.isOwnerOrAdmin,
    canAccessAllDepartments: access.canAccessAllDepartments,
    currentUserName: access.currentUserName,
    roleLabel: access.roleLabel,
    homePath: access.homePath,
    settingsPath: access.settingsPath,
  };
}

export async function getHmsAccessContext(slug: string): Promise<HmsAccessContext> {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) {
    return {
      userId: null,
      role: null,
      departmentRole: null,
      isOwnerOrAdmin: false,
      canAccessAllDepartments: false,
      roleLabel: "Guest",
      currentUserName: "Guest",
      hotelDisplayName: slug,
      logoUrl: null,
      homePath: `/auth/login?from=${encodeURIComponent(`/hms/${slug}/dashboard`)}`,
      settingsPath: `/auth/login?from=${encodeURIComponent(`/hms/${slug}/dashboard`)}`,
      navItems: [],
      allowedSections: [],
    };
  }

  const tenant = await getHotelTenantBySlug(slug);
  const departmentRole =
    typeof user.user_metadata?.department_role === "string"
      ? user.user_metadata.department_role
      : null;
  const fullNameFromMetadata =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";

  if (!tenant) {
    return {
      userId: user.id,
      role: null,
      departmentRole,
      isOwnerOrAdmin: false,
      canAccessAllDepartments: false,
      roleLabel: departmentRole || "Hotel User",
      currentUserName: fullNameFromMetadata || user.email || "Hotel User",
      hotelDisplayName: slug,
      logoUrl: null,
      homePath: "/register",
      settingsPath: "/register",
      navItems: [],
      allowedSections: [],
    };
  }

  const service = createServerSupabaseClient();
  const [{ data: membership }, { data: profile }] = await Promise.all([
    service
      .schema("hotel")
      .from("memberships")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .schema("hotel")
      .from("profiles")
      .select("contact_name")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const role = membership?.role || null;
  const isOwnerOrAdmin = isAdminLikeRole(role);
  const canAccessAllDepartments = hasFullHotelAccess(role, departmentRole);
  const hotelDisplayName = tenant.display_name?.trim() || tenant.name?.trim() || slug;
  const currentUserName =
    profile?.contact_name?.trim() || fullNameFromMetadata || user.email || hotelDisplayName;

  if (canAccessAllDepartments) {
    return {
      userId: user.id,
      role,
      departmentRole,
      isOwnerOrAdmin,
      canAccessAllDepartments,
      roleLabel: role === "owner" ? "Super Admin" : "General Manager",
      currentUserName,
      hotelDisplayName,
      logoUrl: tenant.logo_url || null,
      homePath: `/hms/${slug}/dashboard`,
      settingsPath: `/hms/${slug}/settings`,
      navItems: getAdminNavItems(slug),
      allowedSections: getAdminAllowedSections(),
    };
  }

  const departmentScope = getDepartmentScopeDefinition(departmentRole);

  if (departmentScope) {
    return {
      userId: user.id,
      role,
      departmentRole,
      isOwnerOrAdmin,
      canAccessAllDepartments,
      roleLabel: departmentScope.roleLabel,
      currentUserName,
      hotelDisplayName,
      logoUrl: tenant.logo_url || null,
      homePath: departmentScope.homePath(slug),
      settingsPath: departmentScope.settingsPath(slug),
      navItems: departmentScope.navItems(slug),
      allowedSections: departmentScope.allowedSections,
    };
  }

  return {
    userId: user.id,
    role,
    departmentRole,
    isOwnerOrAdmin,
    canAccessAllDepartments,
    roleLabel: "Department User",
    currentUserName,
    hotelDisplayName,
    logoUrl: tenant.logo_url || null,
    homePath: `/hms/${slug}/notifications`,
    settingsPath: `/hms/${slug}/notifications`,
    navItems: [],
    allowedSections: ["notifications"],
  };
}

export function hasSectionAccess(access: HmsAccessContext, requiredSection: HmsSectionKey) {
  return access.allowedSections.includes(requiredSection);
}
