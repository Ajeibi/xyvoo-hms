import type { FolioSplitLeg } from "@/lib/hms/folio";

/*
 * Billing windows: names, labels and the routing rule logic, with no server code, so screens can
 * use them too. The database side is in folio-windows.ts and hotel.route_folio_line.
 */

export type BillingWindow = Exclude<FolioSplitLeg, "guest">;
export const BILLING_WINDOWS: BillingWindow[] = ["company", "agent", "other"];

export const WINDOW_LABEL: Record<FolioSplitLeg, string> = {
  guest: "Guest",
  company: "Company",
  agent: "Travel agent",
  other: "Other",
};

export const CHARGE_GROUPS = ["rooms", "food_beverage", "extras", "all"] as const;
export type ChargeGroup = (typeof CHARGE_GROUPS)[number];
export const CHARGE_GROUP_LABEL: Record<ChargeGroup, string> = {
  rooms: "Room nights and their taxes",
  food_beverage: "Food and drink",
  extras: "Other extras (laundry, spa, transport…)",
  all: "Anything else",
};

export type WindowPayer = {
  window: BillingWindow;
  payerName: string;
  arCustomerId: string | null;
  arCustomerName: string | null;
};

export type RoutingRule = { chargeGroup: ChargeGroup; targetWindow: FolioSplitLeg };

export type WindowSummary = {
  window: FolioSplitLeg;
  label: string;
  payerName: string;
  balance: number;
  lineCount: number;
  arCustomerId: string | null;
  arCustomerName: string | null;
};

/** The charge group a line belongs to, the same way the database trigger decides it. */
export function chargeGroupOf(department: string | null): ChargeGroup | null {
  if (department === "rooms") return "rooms";
  if (department === "food_beverage") return "food_beverage";
  if (department == null) return null;
  return "extras";
}

/** Which window a new line would go to under these rules (mirrors hotel.route_folio_line). */
export function routeFor(rules: RoutingRule[], department: string | null): FolioSplitLeg | null {
  const group = chargeGroupOf(department);
  return rules.find((r) => r.chargeGroup === group)?.targetWindow ?? rules.find((r) => r.chargeGroup === "all")?.targetWindow ?? null;
}
