import { isAdminLikeRole } from "@/lib/hms/department-access";

export type RequestsIncidentsCapabilities = {
  canCreate: boolean;
  canUpdate: boolean;
  canEscalate: boolean;
  canManageWaitlist: boolean;
  readOnly: boolean;
};

/** Complaints/incidents/waitlist are Front Desk's own responsibility (unlike guest_requests,
 * which routes out to departments) — Front Desk and Manager/Admin get full access; anyone else
 * with visibility into this page (e.g. Accountant) is read-only. */
export function getRequestsIncidentsCapabilities(params: {
  membershipRole: string;
  departmentRole: string | null;
}): RequestsIncidentsCapabilities {
  const admin = isAdminLikeRole(params.membershipRole);
  const accountant = params.departmentRole === "Accountant" || params.departmentRole === "accountant";
  const manager =
    admin || params.departmentRole === "Manager" || params.departmentRole === "General Manager";
  const frontDesk =
    params.departmentRole === "Front Desk" ||
    params.departmentRole === "front_desk" ||
    params.departmentRole === "Reception";

  const active = (frontDesk || manager) && !accountant;

  return {
    canCreate: active,
    canUpdate: active,
    canEscalate: active,
    canManageWaitlist: active,
    readOnly: !active,
  };
}
