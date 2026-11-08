import { isAdminLikeRole } from "@/lib/hms/department-access";

export type MaintenanceCapabilities = {
  /** Any member of the hotel can report a fault. */
  canReport: boolean;
  /** Assign, change status, take rooms out of order, issue parts, manage assets and schedules. */
  canManage: boolean;
  /** Categories, response times and technicians. */
  canConfigure: boolean;
};

/** Owners, admins and the Maintenance department login run Maintenance; everyone else can only report. */
export function getMaintenanceCapabilities(params: {
  membershipRole: string | null;
  departmentRole: string | null;
}): MaintenanceCapabilities {
  const admin = isAdminLikeRole(params.membershipRole);
  const maint = params.departmentRole === "Maintenance";
  return { canReport: Boolean(params.membershipRole), canManage: admin || maint, canConfigure: admin || maint };
}
