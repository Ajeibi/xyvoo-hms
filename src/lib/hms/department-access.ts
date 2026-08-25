export type HmsSectionKey =
  | "dashboard"
  | "settings"
  | "setup"
  | "rooms"
  | "notifications"
  | "guests"
  | "frontdesk"
  | "reservations"
  | "reservations-settings"
  | "restaurant-bar"
  | "restaurant-bar-settings"
  | "kitchen"
  | "kitchen-settings"
  | "housekeeping"
  | "housekeeping-my-tasks"
  | "housekeeping-assignments"
  | "housekeeping-inspections"
  | "housekeeping-history"
  | "housekeeping-lost-found"
  | "housekeeping-guest-requests"
  | "housekeeping-reports"
  | "housekeeping-settings"
  | "inventory"
  | "inventory-stock"
  | "inventory-receiving"
  | "inventory-requisitions"
  | "inventory-transfers"
  | "inventory-counts"
  | "inventory-waste"
  | "inventory-reports"
  | "inventory-settings"
  | "procurement"
  | "procurement-vendors"
  | "procurement-requisitions"
  | "procurement-orders"
  | "procurement-receiving"
  | "procurement-budgets"
  | "procurement-reports"
  | "procurement-settings"
  | "accounts"
  | "accounts-chart"
  | "accounts-journal"
  | "accounts-trial-balance"
  | "accounts-bills"
  | "accounts-ap-aging"
  | "accounts-invoices"
  | "accounts-ar-aging"
  | "accounts-night-audit"
  | "accounts-settings"
  | "maintenance"
  | "maintenance-settings"
  | "hr"
  | "hr-settings"
  | "revenue"
  | "revenue-settings";

export type HmsNavIconKey =
  | "dashboard"
  | "frontdesk"
  | "reservations"
  | "rooms"
  | "guests"
  | "accounts"
  | "restaurant-bar"
  | "kitchen"
  | "inventory"
  | "procurement"
  | "housekeeping"
  | "maintenance"
  | "hr"
  | "revenue"
  | "settings"
  | "bell"
  | "moon"
  | "doorOpen"
  | "package"
  | "truck"
  | "arrowLeftRight"
  | "clipboardCheck"
  | "trash2";

export type HmsNavItem = {
  key: string;
  icon: HmsNavIconKey;
  label: string;
  path: string;
  tourTarget?: string;
};

type DepartmentScopeDefinition = {
  departmentRole: string;
  roleLabel: string;
  homeSection: HmsSectionKey;
  settingsSection: HmsSectionKey;
  homePath: (slug: string) => string;
  settingsPath: (slug: string) => string;
  navItems: (slug: string) => HmsNavItem[];
  allowedSections: HmsSectionKey[];
};

const ADMIN_SECTIONS: HmsSectionKey[] = [
  "dashboard",
  "settings",
  "setup",
  "rooms",
  "notifications",
  "guests",
  "frontdesk",
  "reservations",
  "reservations-settings",
  "restaurant-bar",
  "restaurant-bar-settings",
  "kitchen",
  "kitchen-settings",
  "housekeeping",
  "housekeeping-my-tasks",
  "housekeeping-assignments",
  "housekeeping-inspections",
  "housekeeping-history",
  "housekeeping-lost-found",
  "housekeeping-guest-requests",
  "housekeeping-reports",
  "housekeeping-settings",
  "inventory",
  "inventory-stock",
  "inventory-receiving",
  "inventory-requisitions",
  "inventory-transfers",
  "inventory-counts",
  "inventory-waste",
  "inventory-reports",
  "inventory-settings",
  "procurement",
  "procurement-vendors",
  "procurement-requisitions",
  "procurement-orders",
  "procurement-receiving",
  "procurement-budgets",
  "procurement-reports",
  "procurement-settings",
  "accounts",
  "accounts-chart",
  "accounts-journal",
  "accounts-trial-balance",
  "accounts-bills",
  "accounts-ap-aging",
  "accounts-invoices",
  "accounts-ar-aging",
  "accounts-night-audit",
  "accounts-settings",
  "maintenance",
  "maintenance-settings",
  "hr",
  "hr-settings",
  "revenue",
  "revenue-settings",
];

export const DEPARTMENT_ROLE_SCOPES: Record<string, DepartmentScopeDefinition> = {
  "Front Desk": {
    departmentRole: "Front Desk",
    roleLabel: "Front Desk",
    homeSection: "frontdesk",
    settingsSection: "frontdesk",
    homePath: (slug) => `/hms/${slug}/frontdesk`,
    settingsPath: (slug) => `/hms/${slug}/frontdesk`,
    navItems: (slug) => [
      { key: "fd-overview", icon: "dashboard", label: "Overview", path: `/hms/${slug}/frontdesk` },
      {
        key: "fd-arrivals",
        icon: "reservations",
        label: "Arrivals",
        path: `/hms/${slug}/frontdesk/arrivals`,
      },
      {
        key: "fd-reservations",
        icon: "clipboardCheck",
        label: "Reservations",
        path: `/hms/${slug}/reservations`,
      },
      { key: "fd-rooms", icon: "rooms", label: "Rooms", path: `/hms/${slug}/frontdesk/rooms` },
      {
        key: "fd-guest-services",
        icon: "guests",
        label: "Guest services",
        path: `/hms/${slug}/frontdesk/guest-services`,
      },
      { key: "fd-guest-dir", icon: "frontdesk", label: "Guest directory", path: `/hms/${slug}/guests` },
      {
        key: "fd-requests",
        icon: "inventory",
        label: "Requests",
        path: `/hms/${slug}/frontdesk/requests`,
      },
      {
        key: "fd-folio",
        icon: "accounts",
        label: "Folio & billing",
        path: `/hms/${slug}/frontdesk/folio`,
      },
      {
        key: "fd-checkout",
        icon: "doorOpen",
        label: "Checkout",
        path: `/hms/${slug}/frontdesk/checkout`,
      },
      {
        key: "fd-notifications",
        icon: "bell",
        label: "Notifications",
        path: `/hms/${slug}/notifications`,
      },
    ],
    allowedSections: ["frontdesk", "reservations", "notifications", "guests"],
  },
  Housekeeping: {
    departmentRole: "Housekeeping",
    roleLabel: "Housekeeping",
    homeSection: "housekeeping-my-tasks",
    settingsSection: "housekeeping-my-tasks",
    homePath: (slug) => `/hms/${slug}/housekeeping/my-tasks`,
    settingsPath: (slug) => `/hms/${slug}/housekeeping/my-tasks`,
    navItems: (slug) => [
      { key: "housekeeping-my-tasks", icon: "housekeeping", label: "Housekeeping tasks", path: `/hms/${slug}/housekeeping/my-tasks` },
      { key: "housekeeping-inspections", icon: "clipboardCheck", label: "Inspections", path: `/hms/${slug}/housekeeping/inspections` },
      { key: "housekeeping-history", icon: "clipboardCheck", label: "History", path: `/hms/${slug}/housekeeping/history` },
      { key: "housekeeping-lost-found", icon: "clipboardCheck", label: "Lost & found", path: `/hms/${slug}/housekeeping/lost-found` },
      { key: "housekeeping-guest-requests", icon: "clipboardCheck", label: "Guest requests", path: `/hms/${slug}/housekeeping/guest-requests` },
      { key: "housekeeping-notifications", icon: "bell", label: "Notifications", path: `/hms/${slug}/notifications` },
    ],
    allowedSections: [
      "housekeeping-my-tasks",
      "housekeeping-inspections",
      "housekeeping-history",
      "housekeeping-lost-found",
      "housekeeping-guest-requests",
      "notifications",
    ],
  },
  "F&B Staff": {
    departmentRole: "F&B Staff",
    roleLabel: "Food & Beverage",
    homeSection: "restaurant-bar",
    settingsSection: "restaurant-bar-settings",
    homePath: (slug) => `/hms/${slug}/restaurant-bar`,
    settingsPath: (slug) => `/hms/${slug}/restaurant-bar`,
    navItems: (slug) => [
      { key: "fb-orders", icon: "reservations", label: "Orders", path: `/hms/${slug}/restaurant-bar/orders` },
      { key: "fb-pos", icon: "dashboard", label: "POS", path: `/hms/${slug}/restaurant-bar` },
      { key: "fb-tables", icon: "rooms", label: "Tables", path: `/hms/${slug}/restaurant-bar/tables` },
      {
        key: "fb-history",
        icon: "reservations",
        label: "Order history",
        path: `/hms/${slug}/restaurant-bar/history`,
      },
    ],
    allowedSections: ["restaurant-bar", "notifications"],
  },
  Kitchen: {
    departmentRole: "Kitchen",
    roleLabel: "Kitchen",
    homeSection: "kitchen",
    settingsSection: "kitchen-settings",
    homePath: (slug) => `/hms/${slug}/kitchen`,
    settingsPath: (slug) => `/hms/${slug}/kitchen`,
    navItems: (slug) => [
      { key: "kitchen-live", icon: "dashboard", label: "Live orders", path: `/hms/${slug}/kitchen` },
      { key: "kitchen-menu", icon: "inventory", label: "Menu", path: `/hms/${slug}/kitchen/menu` },
      { key: "kitchen-history", icon: "reservations", label: "Order history", path: `/hms/${slug}/kitchen/history` },
    ],
    allowedSections: ["kitchen", "notifications"],
  },
  Maintenance: {
    departmentRole: "Maintenance",
    roleLabel: "Maintenance",
    homeSection: "maintenance",
    settingsSection: "maintenance-settings",
    homePath: (slug) => `/hms/${slug}/maintenance`,
    settingsPath: (slug) => `/hms/${slug}/maintenance/settings`,
    navItems: (slug) => [
      { key: "maintenance-dashboard", icon: "dashboard", label: "Dashboard", path: `/hms/${slug}/maintenance` },
      { key: "maintenance-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/maintenance/settings` },
    ],
    allowedSections: ["maintenance", "maintenance-settings", "notifications"],
  },
  Procurement: {
    departmentRole: "Procurement",
    roleLabel: "Procurement",
    homeSection: "procurement",
    settingsSection: "procurement-settings",
    homePath: (slug) => `/hms/${slug}/procurement`,
    settingsPath: (slug) => `/hms/${slug}/procurement/settings`,
    navItems: (slug) => [
      { key: "procurement-dashboard", icon: "dashboard", label: "Dashboard", path: `/hms/${slug}/procurement` },
      { key: "procurement-requisitions", icon: "reservations", label: "Requisitions", path: `/hms/${slug}/procurement/requisitions` },
      { key: "procurement-vendors", icon: "truck", label: "Vendors", path: `/hms/${slug}/procurement/vendors` },
      { key: "procurement-orders", icon: "package", label: "Purchase orders", path: `/hms/${slug}/procurement/orders` },
      { key: "procurement-receiving", icon: "clipboardCheck", label: "Receiving", path: `/hms/${slug}/procurement/receiving` },
      { key: "procurement-budgets", icon: "revenue", label: "Budgets", path: `/hms/${slug}/procurement/budgets` },
      { key: "procurement-reports", icon: "revenue", label: "Reports", path: `/hms/${slug}/procurement/reports` },
      {
        key: "procurement-notifications",
        icon: "bell",
        label: "Notifications",
        path: `/hms/${slug}/notifications`,
      },
      { key: "procurement-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/procurement/settings` },
    ],
    allowedSections: [
      "procurement",
      "procurement-vendors",
      "procurement-requisitions",
      "procurement-orders",
      "procurement-receiving",
      "procurement-budgets",
      "procurement-reports",
      "procurement-settings",
      "notifications",
    ],
  },
  "Store / Inventory": {
    departmentRole: "Store / Inventory",
    roleLabel: "Inventory",
    homeSection: "inventory",
    settingsSection: "inventory-settings",
    homePath: (slug) => `/hms/${slug}/inventory`,
    settingsPath: (slug) => `/hms/${slug}/inventory/settings`,
    navItems: (slug) => [
      { key: "inventory-dashboard", icon: "dashboard", label: "Dashboard", path: `/hms/${slug}/inventory` },
      { key: "inventory-stock", icon: "package", label: "Stock levels", path: `/hms/${slug}/inventory/stock` },
      { key: "inventory-receiving", icon: "truck", label: "Receiving", path: `/hms/${slug}/inventory/receiving` },
      {
        key: "inventory-requisitions",
        icon: "reservations",
        label: "Requisitions",
        path: `/hms/${slug}/inventory/requisitions`,
      },
      {
        key: "inventory-transfers",
        icon: "arrowLeftRight",
        label: "Transfers",
        path: `/hms/${slug}/inventory/transfers`,
      },
      { key: "inventory-counts", icon: "clipboardCheck", label: "Stock counts", path: `/hms/${slug}/inventory/counts` },
      { key: "inventory-waste", icon: "trash2", label: "Waste & spoilage", path: `/hms/${slug}/inventory/waste` },
      { key: "inventory-reports", icon: "revenue", label: "Reports", path: `/hms/${slug}/inventory/reports` },
    ],
    allowedSections: [
      "inventory",
      "inventory-stock",
      "inventory-receiving",
      "inventory-requisitions",
      "inventory-transfers",
      "inventory-counts",
      "inventory-waste",
      "inventory-reports",
      "notifications",
    ],
  },
  Accounts: {
    departmentRole: "Accounts",
    roleLabel: "Accounts",
    homeSection: "accounts",
    settingsSection: "accounts-settings",
    homePath: (slug) => `/hms/${slug}/accounts`,
    settingsPath: (slug) => `/hms/${slug}/accounts/settings`,
    navItems: (slug) => [
      { key: "accounts-dashboard", icon: "dashboard", label: "Dashboard", path: `/hms/${slug}/accounts` },
      { key: "accounts-chart", icon: "clipboardCheck", label: "Chart of accounts", path: `/hms/${slug}/accounts/chart` },
      { key: "accounts-journal", icon: "clipboardCheck", label: "Journal entries", path: `/hms/${slug}/accounts/journal` },
      { key: "accounts-trial-balance", icon: "clipboardCheck", label: "Trial balance", path: `/hms/${slug}/accounts/trial-balance` },
      { key: "accounts-bills", icon: "clipboardCheck", label: "Vendor bills", path: `/hms/${slug}/accounts/bills` },
      { key: "accounts-ap-aging", icon: "clipboardCheck", label: "AP aging", path: `/hms/${slug}/accounts/ap-aging` },
      { key: "accounts-invoices", icon: "clipboardCheck", label: "Customer invoices", path: `/hms/${slug}/accounts/invoices` },
      { key: "accounts-ar-aging", icon: "clipboardCheck", label: "AR aging", path: `/hms/${slug}/accounts/ar-aging` },
      { key: "accounts-night-audit", icon: "clipboardCheck", label: "Night audit", path: `/hms/${slug}/accounts/night-audit` },
      { key: "accounts-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/accounts/settings` },
    ],
    allowedSections: [
      "accounts",
      "accounts-chart",
      "accounts-journal",
      "accounts-trial-balance",
      "accounts-bills",
      "accounts-ap-aging",
      "accounts-invoices",
      "accounts-ar-aging",
      "accounts-night-audit",
      "accounts-settings",
      "notifications",
    ],
  },
  "HR Manager": {
    departmentRole: "HR Manager",
    roleLabel: "HR",
    homeSection: "hr",
    settingsSection: "hr-settings",
    homePath: (slug) => `/hms/${slug}/hr`,
    settingsPath: (slug) => `/hms/${slug}/hr/settings`,
    navItems: (slug) => [
      { key: "hr-dashboard", icon: "dashboard", label: "Dashboard", path: `/hms/${slug}/hr` },
      { key: "hr-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/hr/settings` },
    ],
    allowedSections: ["hr", "hr-settings", "notifications"],
  },
};

export function getAdminNavItems(slug: string): HmsNavItem[] {
  return [
    {
      key: "dashboard",
      icon: "dashboard",
      label: "Dashboard",
      path: `/hms/${slug}/dashboard`,
      tourTarget: "sidebar-dashboard",
    },
    {
      key: "frontdesk",
      icon: "frontdesk",
      label: "Front Desk",
      path: `/hms/${slug}/frontdesk`,
      tourTarget: "sidebar-frontdesk",
    },
    {
      key: "reservations",
      icon: "reservations",
      label: "Reservations",
      path: `/hms/${slug}/reservations`,
      tourTarget: "sidebar-reservations",
    },
    {
      key: "rooms",
      icon: "rooms",
      label: "Rooms",
      path: `/hms/${slug}/rooms`,
      tourTarget: "sidebar-rooms",
    },
    {
      key: "guests",
      icon: "guests",
      label: "Guests",
      path: `/hms/${slug}/guests`,
      tourTarget: "sidebar-guests",
    },
    {
      key: "accounts",
      icon: "accounts",
      label: "Accounts",
      path: `/hms/${slug}/accounts`,
      tourTarget: "sidebar-accounts",
    },
    {
      key: "restaurant-bar",
      icon: "restaurant-bar",
      label: "Food & Beverage",
      path: `/hms/${slug}/restaurant-bar`,
      tourTarget: "sidebar-restaurant-bar",
    },
    {
      key: "kitchen",
      icon: "kitchen",
      label: "Kitchen",
      path: `/hms/${slug}/kitchen`,
    },
    {
      key: "inventory",
      icon: "inventory",
      label: "Inventory",
      path: `/hms/${slug}/inventory`,
      tourTarget: "sidebar-inventory",
    },
    {
      key: "procurement",
      icon: "procurement",
      label: "Procurement",
      path: `/hms/${slug}/procurement`,
    },
    {
      key: "housekeeping",
      icon: "housekeeping",
      label: "Housekeeping",
      path: `/hms/${slug}/housekeeping`,
      tourTarget: "sidebar-housekeeping",
    },
    {
      key: "maintenance",
      icon: "maintenance",
      label: "Maintenance",
      path: `/hms/${slug}/maintenance`,
    },
    {
      key: "hr",
      icon: "hr",
      label: "HR",
      path: `/hms/${slug}/hr`,
    },
    {
      key: "revenue",
      icon: "revenue",
      label: "Revenue",
      path: `/hms/${slug}/revenue`,
    },
    {
      key: "settings",
      icon: "settings",
      label: "Settings",
      path: `/hms/${slug}/settings`,
      tourTarget: "sidebar-settings",
    },
  ];
}

/** The granular Front Desk sub-nav (Arrivals, Rooms, Folio, etc.) — Admin/Owner only see the
 * single "Front Desk" tile in their own sidebar, so this powers a secondary panel that lets
 * them jump directly into any Front Desk page without switching role. */
export function getFrontDeskNavItems(slug: string): HmsNavItem[] {
  return DEPARTMENT_ROLE_SCOPES["Front Desk"].navItems(slug);
}

export function isAdminLikeRole(role: string | null) {
  return role === "owner" || role === "admin";
}

export function hasFullHotelAccess(
  membershipRole: string | null,
  departmentRole: string | null,
) {
  return (
    membershipRole === "owner" ||
    (membershipRole === "admin" &&
      (!departmentRole || departmentRole === "Admin / GM" || departmentRole === "Owner"))
  );
}

export function getDepartmentScopeDefinition(departmentRole: string | null) {
  if (!departmentRole) return null;
  return DEPARTMENT_ROLE_SCOPES[departmentRole] ?? null;
}

export function getAdminAllowedSections() {
  return ADMIN_SECTIONS;
}
