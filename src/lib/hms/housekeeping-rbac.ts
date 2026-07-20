import { isAdminLikeRole } from "@/lib/hms/department-access";

export type HousekeepingRoleCapabilities = {
  /** Any recognized Housekeeping-department caller (attendant or admin-like). */
  canAccess: boolean;
  /** Admin/Owner only — the dedicated Housekeeping Supervisor role was removed. */
  isSupervisor: boolean;
  canViewBoard: boolean;
  canManageAssignments: boolean;
  canInspect: boolean;
  canConfigureSettings: boolean;
  canCreateManualTask: boolean;
  canLogLostFound: boolean;
  canResolveLostFound: boolean;
};

/**
 * The "Housekeeping Supervisor" department role was removed — supervisor-tier access (board,
 * assignments, inspections, reports, settings) is now Admin/Owner-only. The "Housekeeping"
 * department role remains as the attendant tier (my tasks, lost & found). Both membershipRole
 * and departmentRole must be checked explicitly — `membershipRole` alone (owner/admin/staff)
 * can never distinguish an attendant from an unrelated department (e.g. Kitchen) staff account.
 */
export function getHousekeepingCapabilities(params: {
  membershipRole: string;
  departmentRole: string | null;
}): HousekeepingRoleCapabilities {
  const admin = isAdminLikeRole(params.membershipRole);
  const supervisor = admin;
  const attendant = params.departmentRole === "Housekeeping";
  const access = admin || supervisor || attendant;

  return {
    canAccess: access,
    isSupervisor: supervisor,
    canViewBoard: supervisor,
    canManageAssignments: supervisor,
    canInspect: supervisor,
    canConfigureSettings: supervisor,
    canCreateManualTask: supervisor,
    canLogLostFound: access,
    canResolveLostFound: supervisor,
  };
}
