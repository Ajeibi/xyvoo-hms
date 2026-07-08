/** Shared reservation KPIs — same formulas on dashboard and front desk. */

export type ReservationHeadcountRow = {
  status: string;
  adults: number;
  children_json: unknown;
};

export function countChildrenJson(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  return raw.length;
}

/** Adults + children on active checked-in stays (matches dashboard Guests card). */
export function countInHouseGuestHeadcount(reservations: ReservationHeadcountRow[]): number {
  return reservations
    .filter((r) => r.status === "checked_in")
    .reduce((sum, r) => sum + r.adults + countChildrenJson(r.children_json), 0);
}
