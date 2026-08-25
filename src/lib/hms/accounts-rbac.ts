import { isAdminLikeRole } from "@/lib/hms/department-access";

export type AccountsRoleCapabilities = {
  /** Any recognized Accounts-department caller (or admin-like). */
  canAccess: boolean;
  canManageChartOfAccounts: boolean;
  canPostJournalEntry: boolean;
  canReverseJournalEntry: boolean;
  canViewReports: boolean;
  canCreateVendorBill: boolean;
  /** Matches Procurement's PO-approval gating exactly (GM/Owner only) — the configured
   * "finance" approver tier is not yet a distinct enforced role, same open gap already
   * noted on Procurement's own PO-approval endpoint. */
  canApproveVendorBill: boolean;
  /** Recording a payment run doesn't need a second GM sign-off — the bill was already
   * approved; paying it is executing that decision, same as Procurement's "mark as
   * ordered" not requiring re-approval after a PO is already approved. */
  canRecordPayment: boolean;
  /** AR has no approval gate at all (unlike vendor bills) — raising an invoice
   * recognizes revenue already earned, not a future spend commitment, so any
   * Accounts caller can create one, manage the customer register, and receive
   * payment against it. */
  canManageArCustomers: boolean;
  canCreateCustomerInvoice: boolean;
  canReceivePayment: boolean;
  /** Posts real revenue for the whole property — trusted to the same "Accounts owns its own
   * ledger" model as everything else here, not gated to admin-only. */
  canRunNightAudit: boolean;
};

/**
 * There is no separate "Accounts Supervisor" tier — same trusted-department model already
 * used for Housekeeping: the "Accounts" department role is trusted to manage its own chart of
 * accounts and post/reverse its own entries, same as Admin/Owner. Both membershipRole and
 * departmentRole must be checked explicitly, since membershipRole alone can never distinguish
 * an Accounts staffer from an unrelated department (e.g. Kitchen) account.
 */
export function getAccountsCapabilities(params: {
  membershipRole: string;
  departmentRole: string | null;
}): AccountsRoleCapabilities {
  const admin = isAdminLikeRole(params.membershipRole);
  const staff = params.departmentRole === "Accounts";
  const access = admin || staff;

  return {
    canAccess: access,
    canManageChartOfAccounts: access,
    canPostJournalEntry: access,
    canReverseJournalEntry: access,
    canViewReports: access,
    canCreateVendorBill: access,
    canApproveVendorBill: admin,
    canRecordPayment: access,
    canManageArCustomers: access,
    canCreateCustomerInvoice: access,
    canReceivePayment: access,
    canRunNightAudit: access,
  };
}
