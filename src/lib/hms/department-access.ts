export type HmsSectionKey =
  | "dashboard"
  | "settings"
  | "setup"
  | "rooms"
  | "notifications"
  | "guests"
  | "frontdesk"
  | "frontdesk-settings"
  | "reservations"
  | "reservations-settings"
  | "restaurant-bar"
  | "restaurant-bar-settings"
  | "kitchen"
  | "kitchen-settings"
  | "housekeeping"
  | "housekeeping-settings"
  | "inventory"
  | "inventory-settings"
  | "procurement"
  | "procurement-settings"
  | "accounts"
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
  | "doorOpen";

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
  "frontdesk-settings",
  "reservations",
  "reservations-settings",
  "restaurant-bar",
  "restaurant-bar-settings",
  "kitchen",
  "kitchen-settings",
  "housekeeping",
  "housekeeping-settings",
  "inventory",
  "inventory-settings",
  "procurement",
  "procurement-settings",
  "accounts",
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
    settingsSection: "frontdesk-settings",
    homePath: (slug) => `/hms/${slug}/frontdesk`,
    settingsPath: (slug) => `/hms/${slug}/frontdesk/settings`,
    navItems: (slug) => [
      { key: "fd-overview", icon: "dashboard", label: "Overview", path: `/hms/${slug}/frontdesk` },
      {
        key: "fd-arrivals",
        icon: "reservations",
        label: "Arrivals",
        path: `/hms/${slug}/frontdesk/arrivals`,
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
      { key: "fd-night", icon: "moon", label: "Night shift", path: `/hms/${slug}/frontdesk/night` },
      { key: "fd-reports", icon: "revenue", label: "Reports", path: `/hms/${slug}/frontdesk/reports` },
      {
        key: "fd-notifications",
        icon: "bell",
        label: "Notifications",
        path: `/hms/${slug}/notifications`,
      },
      {
        key: "frontdesk-settings",
        icon: "settings",
        label: "Settings",
        path: `/hms/${slug}/frontdesk/settings`,
      },
    ],
    allowedSections: ["frontdesk", "frontdesk-settings", "notifications", "guests"],
  },
  Reservations: {
    departmentRole: "Reservations",
    roleLabel: "Reservations",
    homeSection: "reservations",
    settingsSection: "reservations-settings",
    homePath: (slug) => `/hms/${slug}/reservations`,
    settingsPath: (slug) => `/hms/${slug}/reservations/settings`,
    navItems: (slug) => [
      { key: "reservations-dashboard", icon: "dashboard", label: "Dashboard", path: `/hms/${slug}/reservations` },
      { key: "reservations-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/reservations/settings` },
    ],
    allowedSections: ["reservations", "reservations-settings", "notifications", "guests"],
  },
  Housekeeping: {
    departmentRole: "Housekeeping",
    roleLabel: "Housekeeping",
    homeSection: "housekeeping",
    settingsSection: "housekeeping-settings",
    homePath: (slug) => `/hms/${slug}/housekeeping`,
    settingsPath: (slug) => `/hms/${slug}/housekeeping/settings`,
    navItems: (slug) => [
      { key: "housekeeping-dashboard", icon: "dashboard", label: "Dashboard", path: `/hms/${slug}/housekeeping` },
      { key: "housekeeping-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/housekeeping/settings` },
    ],
    allowedSections: ["housekeeping", "housekeeping-settings", "notifications"],
  },
  "F&B Staff": {
    departmentRole: "F&B Staff",
    roleLabel: "Food & Beverage",
    homeSection: "restaurant-bar",
    settingsSection: "restaurant-bar-settings",
    homePath: (slug) => `/hms/${slug}/restaurant-bar`,
    settingsPath: (slug) => `/hms/${slug}/restaurant-bar`,
    navItems: (slug) => [
      { key: "fb-pos", icon: "dashboard", label: "POS", path: `/hms/${slug}/restaurant-bar` },
      { key: "fb-tables", icon: "rooms", label: "Tables", path: `/hms/${slug}/restaurant-bar/tables` },
      { key: "fb-orders", icon: "reservations", label: "Orders", path: `/hms/${slug}/restaurant-bar/orders` },
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
      { key: "procurement-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/procurement/settings` },
    ],
    allowedSections: ["procurement", "procurement-settings", "notifications"],
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
      { key: "inventory-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/inventory/settings` },
    ],
    allowedSections: ["inventory", "inventory-settings", "notifications"],
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
      { key: "accounts-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/accounts/settings` },
    ],
    allowedSections: ["accounts", "accounts-settings", "notifications"],
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
  "Revenue Manager": {
    departmentRole: "Revenue Manager",
    roleLabel: "Revenue",
    homeSection: "revenue",
    settingsSection: "revenue-settings",
    homePath: (slug) => `/hms/${slug}/revenue`,
    settingsPath: (slug) => `/hms/${slug}/revenue/settings`,
    navItems: (slug) => [
      { key: "revenue-dashboard", icon: "dashboard", label: "Dashboard", path: `/hms/${slug}/revenue` },
      { key: "revenue-settings", icon: "settings", label: "Settings", path: `/hms/${slug}/revenue/settings` },
    ],
    allowedSections: ["revenue", "revenue-settings", "notifications"],
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
