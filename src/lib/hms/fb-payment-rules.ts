/**
 * Money rules for settling an F&B order. Pure functions so they can be unit
 * tested; the database triggers in `fb_settlement_guards` enforce the same
 * "settle once, then the bill is frozen" rule whichever route changes the data.
 */

export type FbOutletTender = "cash" | "card" | "pos";

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

type SettleableOrder = {
  status: string;
  settlement_method: string | null;
  subtotal: number;
  paid_amount?: number | null;
};

/** Why this order can't take a payment right now, or null when it can. */
export function settlementBlockReason(order: SettleableOrder): string | null {
  if (order.status === "voided") return "This order was cancelled, so there is nothing to pay.";
  if (order.status === "merged") return "This bill was combined into another one.";
  if (order.settlement_method === "room_charge") return "This order has already been charged to a room.";
  if (order.settlement_method) return "This order has already been paid.";
  if (roundMoney(order.subtotal) <= 0) return "This order has nothing to pay yet.";
  return null;
}

/**
 * Why this order can't be charged to a room. A room charge is for the whole
 * bill; to put one guest's share on their room, split their items into their
 * own bill first.
 */
export function roomChargeBlockReason(order: SettleableOrder): string | null {
  const blocked = settlementBlockReason(order);
  if (blocked) return blocked;
  if ((order.paid_amount ?? 0) > 0) {
    return "Part of this bill is already paid. To charge the rest to a room, split those items into their own bill first.";
  }
  return null;
}

export type OutletPaymentResult =
  | { ok: true; amountTendered: number; changeGiven: number }
  | { ok: false; error: string };

/**
 * Checks a payment taken at the outlet against the bill.
 * Cash may be more than the bill (the difference is change); card and terminal
 * payments must be for the exact bill. Leaving `tendered` out means "exact".
 * Paying less than the bill is refused: part payments arrive with split bills.
 */
export function resolveOutletPayment(params: {
  billTotal: number;
  method: FbOutletTender;
  tendered?: number | null;
}): OutletPaymentResult {
  const bill = roundMoney(params.billTotal);
  if (!(bill > 0)) return { ok: false, error: "This order has nothing to pay yet." };

  const tendered = params.tendered == null ? bill : roundMoney(params.tendered);
  if (!Number.isFinite(tendered) || tendered <= 0) {
    return { ok: false, error: "Enter the amount received." };
  }

  if (params.method === "cash") {
    if (tendered < bill) {
      return { ok: false, error: "The cash received is less than the bill." };
    }
    return { ok: true, amountTendered: tendered, changeGiven: roundMoney(tendered - bill) };
  }

  if (tendered !== bill) {
    return { ok: false, error: "Card and terminal payments must be for the exact bill." };
  }
  return { ok: true, amountTendered: bill, changeGiven: 0 };
}

/** What is still owed on a bill. */
export function leftToPay(order: { subtotal: number; paid_amount?: number | null }) {
  return Math.max(0, roundMoney(order.subtotal - (order.paid_amount ?? 0)));
}

/**
 * Splits an amount into `people` equal shares, to the kobo. Any odd kobo go
 * on the first shares, so the shares always add up to the amount exactly.
 */
export function evenShares(amount: number, people: number): number[] {
  const n = Math.max(1, Math.floor(people));
  const kobo = Math.round(amount * 100);
  const base = Math.floor(kobo / n);
  const extra = kobo - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

/**
 * Checks one payment towards a bill (all of it, or a part). Cash may be more
 * than the amount (the rest is change); card and terminal must be exact.
 */
export function resolvePartPayment(params: {
  left: number;
  amount: number;
  method: FbOutletTender;
  tendered?: number | null;
}): OutletPaymentResult {
  const left = roundMoney(params.left);
  const amount = roundMoney(params.amount);
  if (!(left > 0)) return { ok: false, error: "This bill has nothing left to pay." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount to pay." };
  if (amount > left) return { ok: false, error: "That is more than is left to pay." };
  const paid = resolveOutletPayment({ billTotal: amount, method: params.method, tendered: params.tendered });
  if (!paid.ok && params.method === "cash") {
    return { ok: false, error: "The cash received is less than the amount being paid." };
  }
  if (!paid.ok) return { ok: false, error: "Card and terminal payments must be for the exact amount." };
  return paid;
}
