import { isAdminLikeRole } from "@/lib/hms/department-access";

export type GuestServicesRoleCapabilities = {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canPostFolio: boolean;
  canViewManagerNotes: boolean;
  /** When set, list/detail only rows assigned to this department slug (lowercase). */
  departmentScope: string | null;
  readOnly: boolean;
};

/** Map department role to guest_requests.department filter (lowercase slug). */
export function departmentScopeForRole(departmentRole: string | null): string | null {
  if (!departmentRole) return null;
  const r = departmentRole.trim();
  if (r === "Housekeeping" || r === "housekeeping") return "housekeeping";
  if (r === "Maintenance" || r === "maintenance") return "maintenance";
  if (r === "F&B Staff" || r === "Kitchen") return "food_beverage";
  return null;
}

/**
 * `membershipRole` (owner/admin/staff, from `hotel.memberships.role`) and `departmentRole`
 * (e.g. "Front Desk", "Housekeeping", from the user's `department_role` metadata) live in two
 * different role spaces — both must be passed explicitly. Passing only the membership role
 * (as every call site here used to) makes every non-admin staff account fail every check,
 * since "staff" never matches "Front Desk", "Manager", or any department scope.
 */
export function getGuestServicesCapabilities(params: {
  membershipRole: string;
  departmentRole: string | null;
}): GuestServicesRoleCapabilities {
  const admin = isAdminLikeRole(params.membershipRole);
  const accountant = params.departmentRole === "Accountant" || params.departmentRole === "accountant";
  const manager =
    admin ||
    params.departmentRole === "Manager" ||
    params.departmentRole === "manager" ||
    params.departmentRole === "General Manager";
  const frontDesk = rLikeFrontDesk(params.departmentRole);
  const dept = departmentScopeForRole(params.departmentRole);

  return {
    canView: !accountant || true,
    canCreate: (frontDesk || manager) && !accountant,
    canUpdate: (frontDesk || manager || dept !== null) && !accountant,
    canPostFolio: (frontDesk || manager) && !accountant,
    canViewManagerNotes: manager || admin,
    departmentScope: accountant ? null : dept,
    readOnly: accountant,
  };
}

function rLikeFrontDesk(departmentRole: string | null) {
  return departmentRole === "Front Desk" || departmentRole === "front_desk" || departmentRole === "Reception";
}
