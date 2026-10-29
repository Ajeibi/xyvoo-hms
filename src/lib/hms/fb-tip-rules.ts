/**
 * Tips: taken with a cash, card or terminal payment, kept apart from the bill,
 * owed to one member of staff or to the shared pool until paid out. Pure
 * functions; hotel.fb_take_payment and hotel.fb_pay_tips enforce the same rules.
 */

import { evenShares, type FbOutletTender, resolvePartPayment, roundMoney } from "@/lib/hms/fb-payment-rules";

export type FbTipPayoutMethod = "cash" | "bank";
export type FbTipSource = "own" | "pool";

export type TippedPaymentResult =
  | { ok: true; amountTendered: number; changeGiven: number; tip: number }
  | { ok: false; error: string };

/**
 * Checks a payment with a tip on top. The guest hands over (or the card
 * machine charges) the amount plus the tip; cash change is what is left after
 * both. The tip is capped at the amount being paid, to catch typing slips.
 */
export function resolveTippedPayment(params: {
  left: number;
  amount: number;
  method: FbOutletTender;
  tendered?: number | null;
  tip?: number | null;
}): TippedPaymentResult {
  const tip = roundMoney(params.tip ?? 0);
  if (!Number.isFinite(tip) || tip < 0) return { ok: false, error: "A tip can't be negative." };
  const amount = roundMoney(params.amount);
  if (tip > amount) return { ok: false, error: "The tip can't be more than the amount being paid. Check the figures." };

  const base = resolvePartPayment({ left: params.left, amount, method: params.method });
  if (!base.ok) return base;

  const due = roundMoney(amount + tip);
  const tendered = params.tendered == null ? due : roundMoney(params.tendered);
  if (!Number.isFinite(tendered) || tendered <= 0) return { ok: false, error: "Enter the amount received." };
  if (params.method === "cash") {
    if (tendered < due) {
      return {
        ok: false,
        error: tip > 0 ? "The cash received is less than the amount being paid plus the tip." : "The cash received is less than the amount being paid.",
      };
    }
    return { ok: true, amountTendered: tendered, changeGiven: roundMoney(tendered - due), tip };
  }
  if (tendered !== due) {
    return {
      ok: false,
      error: tip > 0 ? "Card and terminal payments must be for the exact amount plus the tip." : "Card and terminal payments must be for the exact amount.",
    };
  }
  return { ok: true, amountTendered: due, changeGiven: 0, tip };
}

/** Quick tip buttons: a percentage of the amount being paid, rounded to the naira. */
export function tipFromPercent(amount: number, percent: number) {
  return Math.round((amount * percent) / 100);
}

export type FbTipRow = { staff_id: string | null; tip_amount: number; method: string; created_at: string };
export type FbTipPayoutRow = { staff_id: string; source: FbTipSource; amount: number; method: FbTipPayoutMethod; created_at: string };

export type FbTipBalance = {
  /** null = the shared pool. */
  staffId: string | null;
  earned: number;
  /** Of what was earned, how much came in as cash (already in the drawer). */
  earnedCash: number;
  paid: number;
  owed: number;
};

/**
 * What each person (and the pool) has been given, has been paid, and is
 * still owed. Pool payouts come off the pool, not the person's own balance.
 * Everyone with tips or payouts gets a row; the pool row comes first.
 */
export function tipBalances(tips: FbTipRow[], payouts: FbTipPayoutRow[]): FbTipBalance[] {
  const rows = new Map<string, FbTipBalance>();
  const key = (id: string | null) => id ?? "__pool__";
  const row = (id: string | null) => {
    let r = rows.get(key(id));
    if (!r) {
      r = { staffId: id, earned: 0, earnedCash: 0, paid: 0, owed: 0 };
      rows.set(key(id), r);
    }
    return r;
  };
  for (const t of tips) {
    if (!(t.tip_amount > 0)) continue;
    const r = row(t.staff_id);
    r.earned = roundMoney(r.earned + t.tip_amount);
    if (t.method === "cash") r.earnedCash = roundMoney(r.earnedCash + t.tip_amount);
  }
  for (const p of payouts) {
    const r = row(p.source === "pool" ? null : p.staff_id);
    r.paid = roundMoney(r.paid + p.amount);
  }
  for (const r of rows.values()) r.owed = roundMoney(r.earned - r.paid);
  return [...rows.values()].sort((a, b) => (a.staffId === null ? -1 : b.staffId === null ? 1 : 0));
}

/** Shares the pool equally between the chosen people, to the kobo. */
export function poolShares(amount: number, staffIds: string[]) {
  const people = [...new Set(staffIds)];
  if (!people.length || !(amount > 0)) return [];
  const shares = evenShares(roundMoney(amount), people.length);
  return people.map((staffId, i) => ({ staffId, amount: shares[i] }));
}

/** Checks a payout before it is sent. */
export function payoutBlockReason(params: { owed: number; amounts: number[] }): string | null {
  if (!params.amounts.length) return "Choose who is being paid.";
  if (params.amounts.some((a) => !Number.isFinite(a) || roundMoney(a) <= 0)) return "Each amount must be more than zero.";
  const total = roundMoney(params.amounts.reduce((s, a) => s + roundMoney(a), 0));
  if (total > roundMoney(params.owed)) return "That is more than is owed.";
  return null;
}
