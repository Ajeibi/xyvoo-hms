import type { FrontDeskDisplayStatus } from "@/lib/hms/front-desk-board";

export const ROOM_STATUS_CELL_CLASS: Record<FrontDeskDisplayStatus, string> = {
  overdueCheckout: "bg-red-500 text-white hover:bg-red-600",
  available: "bg-emerald-500 text-white hover:bg-emerald-600",
  reserved: "bg-amber-400 text-slate-900 hover:bg-amber-500",
  dirty: "bg-orange-500 text-white hover:bg-orange-600",
  maintenance: "bg-violet-600 text-white hover:bg-violet-700",
  outOfService: "bg-slate-400 text-white hover:bg-slate-500",
  inHouse: "bg-blue-600 text-white hover:bg-blue-700",
};

export const SUMMARY_CARD_CLASS: Record<
  keyof import("@/lib/hms/front-desk-board").FrontDeskSummaryCounts,
  string
> = {
  overdueCheckout: "bg-red-500",
  available: "bg-emerald-500",
  reserved: "bg-amber-400",
  dirty: "bg-orange-500",
  maintenance: "bg-violet-600",
  outOfService: "bg-slate-400",
  inHouse: "bg-blue-600",
};

export const SUMMARY_CARD_LABELS: Record<
  keyof import("@/lib/hms/front-desk-board").FrontDeskSummaryCounts,
  string
> = {
  overdueCheckout: "Overdue Checkouts",
  available: "Available",
  reserved: "Reserved / Booked",
  dirty: "Dirty / Cleaning",
  maintenance: "Maintenance",
  outOfService: "Out of Service",
  inHouse: "Occupied rooms",
};
