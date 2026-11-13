import type { FrontDeskDisplayStatus } from "@/lib/hms/front-desk-board";

/*
 * One colour per room state, all on different hues so none can be mistaken for another:
 * deep red overdue, green available, pink reserved, bright orange dirty/cleaning, cyan maintenance,
 * grey out of service, blue in-house. Light fills (green, orange, grey) carry dark text and the
 * darker fills carry white text, so every cell reads at 4.5:1 or better in light mode.
 * Flags use a dark ring, payment uses the corner dot (payment-styles.ts: purple is refund pending)
 * and "needs attention" is a badge on the cell; none of them reuses a cell colour.
 * The legend and summary cards read from these maps.
 */
/** Ring drawn round a cell whose room is DND, on security hold or staff-restricted. */
export const ROOM_FLAG_RING_CLASS = "ring-2 ring-slate-900 ring-offset-1 ring-offset-white";

/** Badge on a cell: priority clean requested, or cleaned and awaiting inspection. */
export const NEEDS_ATTENTION_BADGE_CLASS = "bg-amber-300 text-amber-950 ring-1 ring-white";

export const ROOM_STATUS_CELL_CLASS: Record<FrontDeskDisplayStatus, string> = {
  overdueCheckout: "bg-red-700 text-white hover:bg-red-800",
  available: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
  reserved: "bg-pink-600 text-white hover:bg-pink-700",
  dirty: "bg-orange-500 text-slate-950 hover:bg-orange-400",
  maintenance: "bg-cyan-700 text-white hover:bg-cyan-800",
  outOfService: "bg-slate-400 text-slate-950 hover:bg-slate-300",
  inHouse: "bg-blue-600 text-white hover:bg-blue-700",
};

export const SUMMARY_CARD_CLASS: Record<
  keyof import("@/lib/hms/front-desk-board").FrontDeskSummaryCounts,
  string
> = {
  overdueCheckout: "bg-red-700",
  available: "bg-emerald-500",
  reserved: "bg-pink-600",
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
