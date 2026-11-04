/**
 * Every alert type the HMS raises, grouped so each person can choose what they get
 * ("My alerts" works per group, not per type). A type not listed here falls into "other".
 */
export const ALERT_GROUPS = [
  { key: "front_desk", label: "Front desk", hint: "Arrivals, check-outs, bookings and room moves" },
  { key: "housekeeping", label: "Housekeeping and rooms", hint: "Room status, cleans, inspections, blocks and maintenance" },
  { key: "guest_services", label: "Guest services", hint: "Guest requests, complaints and incidents" },
  { key: "money", label: "Money", hint: "Payments, balances due, refunds and cash float" },
  { key: "stock", label: "Stock", hint: "Items at or below their reorder point" },
  { key: "purchasing", label: "Purchasing", hint: "Purchase orders, deliveries, budgets and supplier bills" },
  { key: "other", label: "Everything else", hint: "Alerts that don't fit another group" },
] as const;

export type AlertGroup = (typeof ALERT_GROUPS)[number]["key"];

const TYPE_GROUP: Record<string, AlertGroup> = {
  walk_in_check_in: "front_desk",
  reservation_created: "front_desk",
  reservation_cancelled: "front_desk",
  vip_arrival: "front_desk",
  arrival_room_not_ready: "front_desk",
  arrival_outstanding_payment: "front_desk",
  checkout_completed: "front_desk",
  overdue_checkout: "front_desk",
  no_show: "front_desk",
  stay_dates_changed: "front_desk",
  waitlist_match: "front_desk",
  room_moved: "front_desk",
  key_reissued: "front_desk",
  room_unlock: "front_desk",
  connecting_linked: "front_desk",
  connecting_unlinked: "front_desk",

  room_status: "housekeeping",
  room_ready: "housekeeping",
  room_blocked: "housekeeping",
  room_incident: "housekeeping",
  maintenance: "housekeeping",
  priority_clean: "housekeeping",
  housekeeping_priority_overdue: "housekeeping",
  housekeeping_inspection_failed: "housekeeping",

  guest_incident_logged: "guest_services",
  guest_incident_escalated: "guest_services",
  guest_request_sla_breach: "guest_services",
  guest_service_request: "guest_services",
  guest_service_escalated: "guest_services",
  guest_service_completed: "guest_services",
  guest_service_assigned: "guest_services",

  payment_received: "money",
  folio_balance_due: "money",
  refund_pending: "money",
  large_charge_posted: "money",
  cash_float_variance: "money",
  commission_due: "money",
  customer_invoice_payment_recorded: "money",
  vendor_bill_payment_recorded: "money",

  low_stock: "stock",

  po_approval_needed: "purchasing",
  po_approved: "purchasing",
  po_rejected: "purchasing",
  goods_received_discrepancy: "purchasing",
  budget_threshold_reached: "purchasing",
  vendor_bill_approval_needed: "purchasing",
  vendor_bill_approved: "purchasing",
  vendor_bill_rejected: "purchasing",
};

export function alertGroupForType(type: string): AlertGroup {
  return TYPE_GROUP[type] ?? "other";
}

const GROUP_PAGE: Record<AlertGroup, string> = {
  front_desk: "frontdesk",
  housekeeping: "housekeeping",
  guest_services: "frontdesk/guest-services",
  money: "accounts",
  stock: "inventory/stock",
  purchasing: "procurement",
  other: "notifications",
};

/** The page an alert opens: its module's main screen. */
export function alertPath(slug: string, type: string) {
  return `/hms/${slug}/${GROUP_PAGE[alertGroupForType(type)]}`;
}

/**
 * Which alert groups each department role sees. A role not listed (and the owner, admins with
 * full access) sees every group, so a new role is never left blind.
 */
const ROLE_GROUPS: Record<string, AlertGroup[]> = {
  "Front Desk": ["front_desk", "guest_services", "housekeeping"],
  Housekeeping: ["housekeeping", "guest_services"],
  Maintenance: ["housekeeping", "guest_services"],
  "F&B Staff": ["stock", "guest_services"],
  Kitchen: ["stock", "guest_services"],
  Procurement: ["purchasing", "stock"],
  "Store / Inventory": ["stock", "purchasing"],
  Accounts: ["money", "purchasing"],
  "HR Manager": ["other"],
};

/** The groups this person's role sees, or null for all of them. */
export function groupsForRole(membershipRole: string | null, departmentRole: string | null): AlertGroup[] | null {
  if (membershipRole === "owner") return null;
  if (membershipRole === "admin" && (!departmentRole || departmentRole === "Admin / GM" || departmentRole === "Owner")) return null;
  return (departmentRole && ROLE_GROUPS[departmentRole]) || null;
}

export function roleSeesGroup(membershipRole: string | null, departmentRole: string | null, group: AlertGroup): boolean {
  const groups = groupsForRole(membershipRole, departmentRole);
  return !groups || groups.includes(group);
}

/** A Postgrest `.or()` filter that keeps only the groups a role sees, or null when it sees all. */
export function roleGroupFilter(groups: AlertGroup[] | null): string | null {
  return groups ? `category.in.(${groups.join(",")})` : null;
}

export const isAlertGroup =(value: string): value is AlertGroup => ALERT_GROUPS.some((g) => g.key === value);
