import { isAdminLikeRole } from "@/lib/hms/department-access";

export type ArrivalsRoleCapabilities = {
  canCheckIn: boolean;
  canAssignRoom: boolean;
  canMarkNoShow: boolean;
  canOverrideRoom: boolean;
  canEditNotes: boolean;
  canViewFolioFinancials: boolean;
  canPostFolioPayments: boolean;
  canBulkActions: boolean;
  canManageRequests: boolean;
};

export function getArrivalsCapabilities(role: string): ArrivalsRoleCapabilities {
  const admin = isAdminLikeRole(role);
  const accountant = role === "Accountant" || role === "accountant";
  const manager = admin || role === "Manager" || role === "manager" || role === "General Manager";

  return {
    canCheckIn: !accountant,
    canAssignRoom: !accountant,
    canMarkNoShow: manager || admin,
    canOverrideRoom: manager || admin,
    canEditNotes: !accountant,
    canViewFolioFinancials: true,
    canPostFolioPayments: !accountant,
    canBulkActions: manager || admin,
    canManageRequests: !accountant,
  };
}
