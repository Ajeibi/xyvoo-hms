/*
 * Deposit policies and what a booking owes, with no server code, so screens can use them too.
 * The money side is in folio-deposits.ts.
 */

export const DEPOSIT_KINDS = ["none", "fixed", "percent", "first_night"] as const;
export type DepositKind = (typeof DEPOSIT_KINDS)[number];

export const DEPOSIT_KIND_LABEL: Record<DepositKind, string> = {
  none: "No deposit",
  fixed: "A fixed amount",
  percent: "A percentage of the stay",
  first_night: "The first night",
};

/** Deposits are taken at the desk, in cash or on the card machine; the HMS never charges a card. */
export const DEPOSIT_METHODS = ["cash", "pos"] as const;
export type DepositMethod = (typeof DEPOSIT_METHODS)[number] | "card" | "transfer";
export const DEPOSIT_METHOD_LABEL: Record<DepositMethod, string> = {
  cash: "Cash",
  pos: "Card machine",
  // Only on deposits recorded before the HMS settled on cash and the card machine.
  card: "Card",
  transfer: "Bank transfer",
};

export type DepositPolicy = {
  /** Null for the hotel's default. */
  roomTypeCode: string | null;
  kind: DepositKind;
  value: number;
  dueDaysBeforeArrival: number;
};

export type DepositStatus = "none" | "paid" | "part" | "due" | "overdue";

export type DepositState = {
  required: number;
  dueDate: string | null;
  paid: number;
  held: number;
  status: DepositStatus;
  /** True when the amount comes from today's policy, not from when the booking was made. */
  fromCurrentPolicy: boolean;
  payments: {
    id: string;
    amount: number;
    method: DepositMethod;
    reference: string | null;
    status: "held" | "applied" | "refunded" | "kept";
    settleReason?: string | null;
    receivedAt: string;
    appliedAt: string | null;
  }[];
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** The policy for a room type: its own, else the hotel's default, else none. */
export function policyFor(policies: DepositPolicy[], roomTypeCode: string | null | undefined): DepositPolicy {
  return (
    policies.find((p) => roomTypeCode && p.roomTypeCode === roomTypeCode) ??
    policies.find((p) => p.roomTypeCode === null) ?? { roomTypeCode: null, kind: "none", value: 0, dueDaysBeforeArrival: 0 }
  );
}

/**
 * What a booking should pay up front, and by when. `stayTotal` is the whole stay with taxes;
 * a deposit is never more than that. The due date is never before the day the booking is made.
 */
export function depositFor(
  policy: DepositPolicy,
  stay: { stayTotal: number; nights: number; arrivalDate: string; bookedOn: string },
): { required: number; dueDate: string | null } {
  const total = Math.max(0, stay.stayTotal);
  let required = 0;
  if (policy.kind === "fixed") required = policy.value;
  else if (policy.kind === "percent") required = (total * policy.value) / 100;
  else if (policy.kind === "first_night") required = total / Math.max(1, stay.nights);
  required = roundMoney(Math.min(required, total));
  if (required <= 0) return { required: 0, dueDate: null };

  const due = new Date(`${stay.arrivalDate}T00:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() - policy.dueDaysBeforeArrival);
  const dueDate = due.toISOString().slice(0, 10);
  return { required, dueDate: dueDate < stay.bookedOn ? stay.bookedOn : dueDate };
}

/** Paid, part paid, due or overdue, as of `today` (yyyy-mm-dd). */
export function depositStatus(required: number, paid: number, dueDate: string | null, today: string): DepositStatus {
  if (required <= 0) return "none";
  if (paid + 0.005 >= required) return "paid";
  if (dueDate && dueDate < today) return "overdue";
  return paid > 0 ? "part" : "due";
}
