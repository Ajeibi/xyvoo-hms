import { isAdminLikeRole } from "@/lib/hms/department-access";

export type ReportsCapabilities = {
  /** Revenue, ledger, tax, cashier and sales reports: owners, admins and Accounts. */
  canViewFinance: boolean;
  /** Arrivals, departures, in house, housekeeping: the front desk as well. */
  canViewOperations: boolean;
  /** Schedule reports to be emailed. */
  canSchedule: boolean;
};

export function getReportsCapabilities(params: { membershipRole: string; departmentRole: string | null }): ReportsCapabilities {
  const admin = isAdminLikeRole(params.membershipRole);
  const finance = admin || params.departmentRole === "Accounts";
  return {
    canViewFinance: finance,
    canViewOperations: finance || params.departmentRole === "Front Desk",
    canSchedule: finance,
  };
}
