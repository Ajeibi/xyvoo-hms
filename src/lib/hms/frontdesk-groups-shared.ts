/* Browser-safe parts of front desk groups: types, constants and the sums. */

export const GROUP_PAYMENT_METHODS = ["cash", "pos"] as const;
export type GroupPaymentMethod = (typeof GROUP_PAYMENT_METHODS)[number];

/** Bookings that can join a group: not yet checked in or already in the house. */
export const GROUPABLE_STATUSES = ["confirmed", "checked_in"];

export type GroupMember = {
  reservationId: string;
  confirmationCode: string;
  guestName: string;
  status: string;
  roomUnitId: string | null;
  roomCode: string | null;
  arrivalAt: string;
  departureAt: string;
  charges: number;
  paid: number;
  balance: number;
};

export type GroupSummary = {
  id: string;
  name: string;
  coordinatorName: string | null;
  coordinatorPhone: string | null;
  sharedBilling: boolean;
  notes: string | null;
  arrivalAt: string | null;
  departureAt: string | null;
  members: GroupMember[];
  totals: { charges: number; paid: number; balance: number };
  counts: { rooms: number; waiting: number; inHouse: number; needRoom: number };
};

export type GroupCandidate = {
  reservationId: string;
  confirmationCode: string;
  guestName: string;
  arrivalAt: string;
  departureAt: string;
  roomCode: string | null;
};

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** Totals and counts over a group's rooms. */
export function summariseGroup(members: GroupMember[]) {
  const live = members.filter((m) => m.status === "confirmed" || m.status === "checked_in");
  return {
    totals: {
      charges: roundMoney(members.reduce((s, m) => s + m.charges, 0)),
      paid: roundMoney(members.reduce((s, m) => s + m.paid, 0)),
      balance: roundMoney(members.reduce((s, m) => s + m.balance, 0)),
    },
    counts: {
      rooms: members.length,
      waiting: live.filter((m) => m.status === "confirmed").length,
      inHouse: live.filter((m) => m.status === "checked_in").length,
      needRoom: live.filter((m) => m.status === "confirmed" && !m.roomUnitId).length,
    },
  };
}

/** The members a group check-in will try: waiting to arrive and already given a room. */
export function membersReadyToCheckIn<T extends Pick<GroupMember, "status" | "roomUnitId">>(members: T[]) {
  return members.filter((m) => m.status === "confirmed" && m.roomUnitId);
}

/**
 * Spreads one payment over the rooms' bills, in the order given, each room taking up to what it
 * owes. `remainder` is what is left once every room is settled: more than the group owes.
 */
export function allocateGroupPayment(rooms: { reservationId: string; balance: number }[], amount: number) {
  let left = roundMoney(amount);
  const allocations: { reservationId: string; amount: number }[] = [];
  for (const room of rooms) {
    if (left <= 0) break;
    const owed = roundMoney(room.balance);
    if (owed <= 0) continue;
    const take = roundMoney(Math.min(owed, left));
    allocations.push({ reservationId: room.reservationId, amount: take });
    left = roundMoney(left - take);
  }
  return { allocations, remainder: left };
}
