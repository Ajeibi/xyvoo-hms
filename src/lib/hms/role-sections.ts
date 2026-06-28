import type { RoleSection } from "@/types";

export type { RoleSection };

export const ROLE_SECTIONS: RoleSection[] = [
  { role: "Admin / GM", sections: "All", canCreateLogin: true },
  { role: "Front Desk", sections: "Front Desk dashboard, workflow, and department settings", canCreateLogin: true },
  { role: "Reservations", sections: "Reservations dashboard, bookings, and department settings", canCreateLogin: true },
  { role: "Housekeeping", sections: "Housekeeping", canCreateLogin: true },
  { role: "F&B Staff", sections: "Food & Beverage dashboard and outlet settings", canCreateLogin: true },
  { role: "Kitchen", sections: "Kitchen dashboard and kitchen-specific settings", canCreateLogin: true },
  { role: "Maintenance", sections: "Maintenance", canCreateLogin: true },
  { role: "Procurement", sections: "Procurement dashboard and supplier settings", canCreateLogin: true },
  { role: "Store / Inventory", sections: "Inventory dashboard and stock settings", canCreateLogin: true },
  { role: "Accounts", sections: "Accounts dashboard and department settings", canCreateLogin: true },
  { role: "HR Manager", sections: "HR dashboard and team settings", canCreateLogin: true },
  { role: "Revenue Manager", sections: "Revenue dashboard and pricing controls", canCreateLogin: true },
  { role: "Owner", sections: "All", canCreateLogin: false },
];

export const CREATABLE_DEPARTMENT_ROLES = ROLE_SECTIONS.filter((r) => r.canCreateLogin).map((r) => r.role);
