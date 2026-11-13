import type { FrontDeskDisplayStatus } from "@/lib/hms/front-desk-board";

/*
 * One colour per room state, all on different hues so none can be mistaken for another:
 * red overdue, emerald available, purple reserved, orange dirty, cyan maintenance, grey out of
 * service, blue in-house. Flags use a dark ring and payment uses the corner dot (payment-styles.ts),
 * neither of which reuses a cell colour. The legend and summary cards read from these maps.
 */
/** Ring drawn round a cell whose room is DND, on security hold or staff-restricted. */
export const ROOM_FLAG_RING_CLASS = "ring-2 ring-slate-900 ring-offset-1 ring-offset-white";

export const ROOM_STATUS_CELL_CLASS: Record<FrontDeskDisplayStatus, string> = {
  overdueCheckout: "bg-red-500 text-white hover:bg-red-600",
  available: "bg-emerald-500 text-white hover:bg-emerald-600",
  reserved: "bg-purple-600 text-white hover:bg-purple-700",
  dirty: "bg-orange-500 text-white hover:bg-orange-600",
  maintenance: "bg-cyan-700 text-white hover:bg-cyan-800",
  outOfService: "bg-slate-400 text-white hover:bg-slate-500",
  inHouse: "bg-blue-600 text-white hover:bg-blue-700",
};

export const SUMMARY_CARD_CLASS: Record<
  keyof import("@/lib/hms/front-desk-board").FrontDeskSummaryCounts,
  string
> = {
  overdueCheckout: "bg-red-500",
  available: "bg-emerald-500",
  reserved: "bg-purple-600",
  dirty: "bg-orange-500",
  maintenance: "bg-cyan-700",
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
