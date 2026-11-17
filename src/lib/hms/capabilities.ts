import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Actions that only a HOD (head of department), an admin or an owner may do on their own. Staff who
 * reach one aren't blocked for good: in phase 2 a HOD approves it on the spot with their own PIN.
 * Each department has a default list (below); an admin can switch any of them on or off per hotel
 * (hotel.hod_only_actions). The check runs on the server, so hiding a button is never the only guard.
 */

export type HodAction =
  | "void"
  | "refund"
  | "discount_over_limit"
  | "rate_change"
  | "close_shift"
  | "close_day"
  | "stock_adjust"
  | "delete_record";

export const HOD_ACTION_LABELS: Record<HodAction, { label: string; hint: string }> = {
  void: { label: "Voids", hint: "Cancelling a charge, order or item after it was recorded." },
  refund: { label: "Refunds", hint: "Giving money back or reversing a payment." },
  discount_over_limit: { label: "Discounts over the limit", hint: "Any discount above the hotel's own limit." },
  rate_change: { label: "Rate changes", hint: "Changing a room rate or price on a booking or menu." },
  close_shift: { label: "Closing a shift", hint: "Closing a cashier's shift and counting the float." },
  close_day: { label: "Closing the day", hint: "Night audit and closing a business day." },
  stock_adjust: { label: "Stock adjustments", hint: "Correcting stock counts, waste and write-offs." },
  delete_record: { label: "Deleting records", hint: "Removing a guest, booking, item or other record." },
};

export const HOD_ACTIONS = Object.keys(HOD_ACTION_LABELS) as HodAction[];

/** Which actions are HOD-only by default, by department role. Departments not listed use `DEFAULT_ALL`. */
export const DEFAULT_HOD_ONLY: Record<string, HodAction[]> = {
  "Front Desk": ["void", "refund", "discount_over_limit", "rate_change", "close_shift", "close_day", "delete_record"],
  Housekeeping: ["delete_record", "stock_adjust"],
  "Housekeeping Inspector": ["delete_record"],
  "F&B Staff": ["void", "refund", "discount_over_limit", "rate_change", "close_shift", "delete_record"],
  Kitchen: ["void", "stock_adjust", "delete_record"],
  Maintenance: ["stock_adjust", "delete_record"],
  Procurement: ["rate_change", "delete_record"],
  "Store / Inventory": ["stock_adjust", "delete_record"],
  Accounts: ["void", "refund", "close_day", "delete_record"],
  "HR Manager": ["delete_record"],
};

const DEFAULT_ALL: HodAction[] = ["void", "refund", "discount_over_limit", "rate_change", "close_shift", "close_day", "stock_adjust", "delete_record"];

export function defaultHodOnly(departmentRole: string | null): HodAction[] {
  return (departmentRole && DEFAULT_HOD_ONLY[departmentRole]) || DEFAULT_ALL;
}

export type HodOverride = { department_role: string; action_key: string; enabled: boolean };

/** The hotel's override rows for one department, tolerant of the table not existing yet. */
export async function loadHodOverrides(service: SupabaseClient, tenantId: string, departmentRole?: string | null): Promise<HodOverride[]> {
  let query = service.schema("hotel").from("hod_only_actions").select("department_role, action_key, enabled").eq("tenant_id", tenantId);
  if (departmentRole) query = query.eq("department_role", departmentRole);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as HodOverride[];
}

/** The actions that are HOD-only in a department once the hotel's overrides are applied. */
export function resolveHodOnly(departmentRole: string | null, overrides: HodOverride[]): Set<HodAction> {
  const set = new Set<HodAction>(defaultHodOnly(departmentRole));
  for (const o of overrides) {
    if (o.department_role !== departmentRole || !HOD_ACTIONS.includes(o.action_key as HodAction)) continue;
    if (o.enabled) set.add(o.action_key as HodAction);
    else set.delete(o.action_key as HodAction);
  }
  return set;
}

/** Whether this person may do `action` without a HOD: owners, admins and HODs always; staff unless it is HOD-only. */
export async function canDoWithoutApproval(
  service: SupabaseClient,
  params: { tenantId: string; membershipRole: string; staffLevel: "hod" | "staff"; departmentRole: string | null; action: HodAction },
): Promise<boolean> {
  if (params.membershipRole === "owner" || params.membershipRole === "admin") return true;
  if (params.staffLevel === "hod") return true;
  const overrides = await loadHodOverrides(service, params.tenantId, params.departmentRole);
  return !resolveHodOnly(params.departmentRole, overrides).has(params.action);
}
