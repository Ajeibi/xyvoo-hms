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

/** Map membership role to guest_requests.department filter (lowercase slug). */
export function departmentScopeForRole(role: string): string | null {
  const r = role.trim();
  if (r === "Housekeeping" || r === "housekeeping") return "housekeeping";
  if (r === "Maintenance" || r === "maintenance") return "maintenance";
  if (r === "F&B Staff" || r === "Kitchen") return "food_beverage";
  return null;
}

export function getGuestServicesCapabilities(role: string): GuestServicesRoleCapabilities {
  const admin = isAdminLikeRole(role);
  const accountant = role === "Accountant" || role === "accountant";
  const manager = admin || role === "Manager" || role === "manager" || role === "General Manager";
  const frontDesk = rLikeFrontDesk(role);
  const dept = departmentScopeForRole(role);

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

function rLikeFrontDesk(role: string) {
  return role === "Front Desk" || role === "front_desk" || role === "Reception";
}
