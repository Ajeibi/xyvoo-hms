import { cache } from "react";
import { getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { resolveEffectiveUser } from "@/lib/hms/active-person";
import { effectiveDepartmentRole, readHotelMembership } from "@/lib/hms/membership-role";
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
  /** HOD or staff within the department; absent for someone who isn't a member. */
  staffLevel?: "hod" | "staff";
  status?: "active" | "suspended";
  mustChangePassword?: boolean;
  /** The screen is locked: only the lock screen shows until someone enters a PIN. */
  locked?: boolean;
  /** Someone other than the signed-in login is at the keys (switched in by PIN). */
  switched?: boolean;
  sessionUserId?: string;
  hasPin?: boolean;
};

export async function getHotelRoleAccess(slug: string) {
  const access = await getHmsAccessContext(slug);
  return {
    userId: access.userId,
    role: access.role,
    departmentRole: access.departmentRole,
    staffLevel: access.staffLevel ?? ("hod" as "hod" | "staff"),
    isOwnerOrAdmin: access.isOwnerOrAdmin,
    canAccessAllDepartments: access.canAccessAllDepartments,
    currentUserName: access.currentUserName,
    roleLabel: access.roleLabel,
    homePath: access.homePath,
    settingsPath: access.settingsPath,
  };
}

/** Cached per server render: the layout, its metadata, HMSLayout and the page all ask for this. */
export const getHmsAccessContext = cache(async (slug: string): Promise<HmsAccessContext> => {
  const user = await getSessionUser();

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
  const metadataDepartmentRole =
    typeof user.user_metadata?.department_role === "string"
      ? user.user_metadata.department_role
      : null;
  const fullNameFromMetadata =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";

  if (!tenant) {
    return {
      userId: user.id,
      role: null,
      departmentRole: metadataDepartmentRole,
      isOwnerOrAdmin: false,
      canAccessAllDepartments: false,
      roleLabel: metadataDepartmentRole || "Hotel User",
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
  // On a shared screen the person whose PIN is active is who the screens are for.
  const effective = await resolveEffectiveUser(tenant.id, user.id);
  const actingId = effective.locked ? user.id : effective.userId;
  const [membership, { data: profile }] = await Promise.all([
    readHotelMembership(service, tenant.id, actingId),
    service
      .schema("hotel")
      .from("profiles")
      .select("contact_name")
      .eq("tenant_id", tenant.id)
      .eq("user_id", actingId)
      .maybeSingle(),
  ]);

  const role = membership?.role || null;
  const standing = {
    locked: effective.locked,
    switched: effective.switched,
    sessionUserId: user.id,
    hasPin: membership?.hasPin ?? false,
    staffLevel: membership?.staffLevel ?? ("hod" as "hod" | "staff"),
    status: membership?.status ?? ("active" as const),
    mustChangePassword: membership?.mustChangePassword ?? false,
  };
  // The department role at this hotel (one login can hold a different one at each hotel in a group).
  const departmentRole = effectiveDepartmentRole(membership, effective.switched ? null : user.user_metadata);
  const isOwnerOrAdmin = isAdminLikeRole(role);
  const canAccessAllDepartments = hasFullHotelAccess(role, departmentRole);
  const hotelDisplayName = tenant.display_name?.trim() || tenant.name?.trim() || slug;
  const currentUserName =
    profile?.contact_name?.trim() || (effective.switched ? effective.name : fullNameFromMetadata) || (effective.switched ? null : user.email) || hotelDisplayName;

  if (canAccessAllDepartments) {
    return {
      userId: actingId,
      role,
      departmentRole,
      isOwnerOrAdmin,
      canAccessAllDepartments,
      ...standing,
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
      userId: actingId,
      role,
      departmentRole,
      isOwnerOrAdmin,
      canAccessAllDepartments,
      ...standing,
      roleLabel: departmentScope.roleLabel,
      currentUserName,
      hotelDisplayName,
      logoUrl: tenant.logo_url || null,
      homePath: departmentScope.homePath(slug),
      settingsPath: departmentScope.settingsPath(slug),
      // A head of department also manages their own team's logins.
      navItems: [
        ...departmentScope.navItems(slug),
        { key: "my-work", icon: "clipboardCheck" as const, label: "My work", path: `/hms/${slug}/my-work` },
        ...(standing.staffLevel === "hod"
          ? [
              { key: "team", icon: "hr" as const, label: "My team", path: `/hms/${slug}/team` },
              { key: "activity", icon: "clipboardCheck" as const, label: "Activity", path: `/hms/${slug}/activity` },
            ]
          : []),
      ],
      allowedSections:
        standing.staffLevel === "hod"
          ? [...departmentScope.allowedSections, "my-work" as const, "team" as const, "activity" as const]
          : [...departmentScope.allowedSections, "my-work" as const],
    };
  }

  return {
    userId: actingId,
    role,
    departmentRole,
    isOwnerOrAdmin,
    canAccessAllDepartments,
    ...standing,
    roleLabel: "Department User",
    currentUserName,
    hotelDisplayName,
    logoUrl: tenant.logo_url || null,
    homePath: `/hms/${slug}/notifications`,
    settingsPath: `/hms/${slug}/notifications`,
    navItems: [],
    allowedSections: ["notifications"],
  };
});

export function hasSectionAccess(access: HmsAccessContext, requiredSection: HmsSectionKey) {
  return access.allowedSections.includes(requiredSection);
}
