import { isAdminLikeRole } from "@/lib/hms/department-access";

export type HousekeepingRoleCapabilities = {
  /** Any recognized Housekeeping-department caller (attendant or admin-like). */
  canAccess: boolean;
  /** Admin/Owner only — the dedicated Housekeeping Supervisor role was removed. */
  isSupervisor: boolean;
  canViewBoard: boolean;
  canManageAssignments: boolean;
  /** Set the free-text "who's on this" label on a task — open to any recognized Housekeeping
   * caller, unlike canManageAssignments (which picks a real login account and stays admin-only). */
  canEditAssignedNote: boolean;
  canInspect: boolean;
  canConfigureSettings: boolean;
  canCreateManualTask: boolean;
  canLogLostFound: boolean;
  canResolveLostFound: boolean;
};

/**
 * The "Housekeeping Supervisor" department role was removed — board, assignments (real-login
 * picking), reports, and settings are Admin/Owner-only. The "Housekeeping" department role is
 * the attendant tier: it sees every open task for the property (not just ones assigned to it —
 * there's only ever one Housekeeping login per tenant today, so staff are divided up manually via
 * the free-text assigned-note label, not through per-attendant logins), can inspect/approve its
 * own cleaned rooms (no separate inspector role exists, so the department is trusted to sign off
 * on its own work), can raise its own ad-hoc tasks (a spill, a guest-requested extra clean) rather
 * than only ever reacting to Front Desk checkouts or a room being flagged dirty, and can log lost
 * & found. Both membershipRole and departmentRole must
 * be checked explicitly — `membershipRole` alone (owner/admin/staff) can never distinguish an
 * attendant from an unrelated department (e.g. Kitchen) staff account.
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
    canEditAssignedNote: access,
    canInspect: access,
    canConfigureSettings: supervisor,
    canCreateManualTask: access,
    canLogLostFound: access,
    canResolveLostFound: supervisor,
  };
}
