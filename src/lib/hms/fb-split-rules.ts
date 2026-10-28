/**
 * Splitting an order into separate bills, and combining bills. Pure rules
 * shared by the Open orders screen and the server.
 */

import { roundMoney } from "@/lib/hms/fb-payment-rules";

export const FB_MAX_BILLS = 8;

type SplittableItem = { id: string; price_snapshot: number; quantity: number; kitchen_status: string };

type SplittableOrder = {
  status: string;
  settlement_method: string | null;
  paid_amount?: number | null;
  items: SplittableItem[];
};

/** Why this order can't be split or combined right now, or null when it can. */
export function splitBlockReason(order: SplittableOrder): string | null {
  if (order.settlement_method) return "A paid bill can't be split or combined.";
  if ((order.paid_amount ?? 0) > 0) return "Part of this bill is already paid, so it can't be split or combined.";
  if (!["open", "sent_to_kitchen", "ready"].includes(order.status)) {
    return "Only open bills can be split or combined.";
  }
  return null;
}

/** Lines that move with a split (cancelled lines stay on the first bill). */
export function splittableItems<T extends SplittableItem>(items: T[]) {
  return items.filter((i) => i.kitchen_status !== "voided");
}

export type SplitPlanResult =
  | { ok: true; bills: string[][]; totals: number[] }
  | { ok: false; error: string };

/**
 * Turns "which bill is each line on" (1-based) into the bills to create.
 * Bill 1 stays as the original order. Every bill must have at least one line,
 * and there must be at least two bills.
 */
export function planSplit(items: SplittableItem[], billOf: Record<string, number>): SplitPlanResult {
  const lines = splittableItems(items);
  if (lines.length < 2) return { ok: false, error: "A bill needs at least two items to split." };

  const byBill = new Map<number, SplittableItem[]>();
  for (const line of lines) {
    const bill = billOf[line.id] ?? 1;
    if (!Number.isInteger(bill) || bill < 1 || bill > FB_MAX_BILLS) {
      return { ok: false, error: `Choose a bill from 1 to ${FB_MAX_BILLS} for every item.` };
    }
    byBill.set(bill, [...(byBill.get(bill) ?? []), line]);
  }
  for (const id of Object.keys(billOf)) {
    if (!lines.some((l) => l.id === id)) return { ok: false, error: "One of the items is no longer on this bill." };
  }

  if (!byBill.has(1)) return { ok: false, error: "Leave at least one item on bill 1." };
  if (byBill.size < 2) return { ok: false, error: "Move at least one item to another bill." };

  // Close gaps: bills 1, 3 and 5 become bills 1, 2 and 3.
  const ordered = [...byBill.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list);
  return {
    ok: true,
    bills: ordered.map((list) => list.map((l) => l.id)),
    totals: ordered.map((list) => billTotal(list)),
  };
}

export function billTotal(items: Pick<SplittableItem, "price_snapshot" | "quantity" | "kitchen_status">[]) {
  return roundMoney(
    items
      .filter((i) => i.kitchen_status !== "voided")
      .reduce((sum, i) => sum + i.price_snapshot * i.quantity, 0),
  );
}

/** Why two bills can't be combined, or null when they can. */
export function mergeBlockReason(
  target: SplittableOrder & { id: string },
  source: SplittableOrder & { id: string },
): string | null {
  if (target.id === source.id) return "Choose a different bill to combine with.";
  return splitBlockReason(target) ?? splitBlockReason(source);
}

/**
 * One bill per seat: the lowest seat (and lines with no seat) stay on bill 1,
 * each other seat gets the next bill.
 */
export function billsBySeat<T extends { id: string; seat: number | null }>(items: T[]) {
  const seats = [...new Set(items.map((i) => i.seat).filter((s): s is number => s != null))].sort((a, b) => a - b);
  const billOfSeat = new Map(seats.map((seat, index) => [seat, index + 1]));
  const billOf: Record<string, number> = {};
  for (const item of items) billOf[item.id] = item.seat != null ? (billOfSeat.get(item.seat) ?? 1) : 1;
  return { billOf, bills: Math.max(1, seats.length) };
}
