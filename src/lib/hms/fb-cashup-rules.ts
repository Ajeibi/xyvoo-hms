/**
 * Cash-up (till session) rules for restaurant and bar outlets. Pure functions;
 * hotel.fb_close_cash_session works out the same figures in the database.
 *
 * The night audit already books F&B revenue and the cash and card takings, so
 * a cash-up books only what it doesn't: tips received (owed to staff, held in
 * 2100 Accrued Expenses) and cash over or short at the count.
 */

import type { JournalEntryLineInput } from "@/lib/hms/journal-entries";
import { roundMoney } from "@/lib/hms/fb-payment-rules";

/** Starter-chart codes used by F&B cash-ups and tip payouts. */
export const FB_CASHUP_ACCOUNTS = {
  cash: "1000",
  bank: "1010",
  cardClearing: "1020",
  tipsOwed: "2100",
  cashOver: "4300",
  cashShort: "5500",
} as const;

export const FB_CASHUP_ACCOUNT_NAMES: Record<keyof typeof FB_CASHUP_ACCOUNTS, string> = {
  cash: "Cash on Hand (1000)",
  bank: "Bank Account (1010)",
  cardClearing: "Card & POS Clearing (1020)",
  tipsOwed: "Accrued Expenses (2100)",
  cashOver: "Miscellaneous Income (4300)",
  cashShort: "Administrative & General (5500)",
};

/** A difference at or above this needs a manager to approve the close. Any difference needs a reason. */
export const FB_CASH_VARIANCE_MANAGER_LIMIT = 1000;

export type CashUpFigures = {
  openingFloat: number;
  cashTaken: number;
  cashTips: number;
  cashTipsPaidOut: number;
};

/** What should be in the till: float + cash taken (bills and tips) - cash tips paid out of it. */
export function expectedCash(f: CashUpFigures) {
  return roundMoney(f.openingFloat + f.cashTaken + f.cashTips - f.cashTipsPaidOut);
}

export function cashVariance(counted: number, expected: number) {
  return roundMoney(counted - expected);
}

/** What closing with this difference needs: a reason for any difference, a manager for a big one. */
export function closeNeeds(variance: number) {
  const size = Math.abs(roundMoney(variance));
  return {
    needsReason: size > 0,
    needsManager: size >= FB_CASH_VARIANCE_MANAGER_LIMIT,
  };
}

/** "Over by ₦500", "Short by ₦200" or "Exact". */
export function varianceLabel(variance: number, money: (n: number) => string) {
  const v = roundMoney(variance);
  if (v === 0) return "Exact";
  return v > 0 ? `Over by ${money(v)}` : `Short by ${money(-v)}`;
}

/**
 * The journal lines for a closed cash-up. Tips are owed to staff (a
 * liability) until paid out; over is income, short is an expense. Returns an
 * empty list when there is nothing to book.
 */
export function cashUpJournalLines(
  booked: { cashTips: number; cardTips: number; variance: number },
  accounts: Record<keyof typeof FB_CASHUP_ACCOUNTS, string>,
  department: string,
): JournalEntryLineInput[] {
  const lines: JournalEntryLineInput[] = [];
  const cashTips = roundMoney(booked.cashTips);
  const cardTips = roundMoney(booked.cardTips);
  const variance = roundMoney(booked.variance);
  if (cashTips > 0) {
    lines.push({ accountId: accounts.cash, department, description: "Cash tips received", debit: cashTips, credit: 0 });
  }
  if (cardTips > 0) {
    lines.push({ accountId: accounts.cardClearing, department, description: "Card machine tips received", debit: cardTips, credit: 0 });
  }
  const tips = roundMoney(cashTips + cardTips);
  if (tips > 0) {
    lines.push({ accountId: accounts.tipsOwed, department, description: "Tips owed to staff", debit: 0, credit: tips });
  }
  if (variance > 0) {
    lines.push({ accountId: accounts.cash, department, description: "Cash over at count", debit: variance, credit: 0 });
    lines.push({ accountId: accounts.cashOver, department, description: "Cash over at count", debit: 0, credit: variance });
  } else if (variance < 0) {
    lines.push({ accountId: accounts.cashShort, department, description: "Cash short at count", debit: -variance, credit: 0 });
    lines.push({ accountId: accounts.cash, department, description: "Cash short at count", debit: 0, credit: -variance });
  }
  return lines;
}

/** Journal lines for tips handed to staff: the amount owed goes down, cash or bank goes down. */
export function tipPayoutJournalLines(
  amount: number,
  method: "cash" | "bank",
  accounts: Pick<Record<keyof typeof FB_CASHUP_ACCOUNTS, string>, "cash" | "bank" | "tipsOwed">,
): JournalEntryLineInput[] {
  const total = roundMoney(amount);
  if (!(total > 0)) return [];
  return [
    { accountId: accounts.tipsOwed, department: "Other", description: "Tips paid to staff", debit: total, credit: 0 },
    {
      accountId: method === "cash" ? accounts.cash : accounts.bank,
      department: "Other",
      description: method === "cash" ? "Tips paid in cash" : "Tips paid by bank transfer",
      debit: 0,
      credit: total,
    },
  ];
}

/** Restaurant outlets book to the Kitchen cost centre, bars to Bar. */
export function outletDepartment(outletType: string | null | undefined) {
  return outletType === "bar" ? "Bar" : "Kitchen";
}

export type ZReportPayment = { method: string; amount: number; tip_amount: number };
export type ZReportLine = { kitchen_status: string; price_snapshot: number; quantity: number; comped_at: string | null; original_price: number | null; list_price: number | null };

export type ZReport = {
  bills: number;
  cash: number;
  card: number;
  roomCharge: number;
  cashTips: number;
  cardTips: number;
  voidedLines: number;
  voidedValue: number;
  compedLines: number;
  compedValue: number;
  /** Money off (or added) by happy hours and other price rules. */
  priceRuleDiscount: number;
};

/** End-of-shift totals from the payments and lines of the bills paid during the shift. */
export function zReport(params: { payments: ZReportPayment[]; lines: ZReportLine[]; bills: number }): ZReport {
  const r: ZReport = {
    bills: params.bills,
    cash: 0,
    card: 0,
    roomCharge: 0,
    cashTips: 0,
    cardTips: 0,
    voidedLines: 0,
    voidedValue: 0,
    compedLines: 0,
    compedValue: 0,
    priceRuleDiscount: 0,
  };
  for (const p of params.payments) {
    if (p.method === "cash") {
      r.cash += p.amount;
      r.cashTips += p.tip_amount;
    } else if (p.method === "card" || p.method === "pos") {
      r.card += p.amount;
      r.cardTips += p.tip_amount;
    } else if (p.method === "room_charge") {
      r.roomCharge += p.amount;
    }
  }
  for (const l of params.lines) {
    if (l.kitchen_status === "voided") {
      r.voidedLines += l.quantity;
      r.voidedValue += l.price_snapshot * l.quantity;
      continue;
    }
    if (l.comped_at) {
      r.compedLines += l.quantity;
      r.compedValue += (l.original_price ?? 0) * l.quantity;
    }
    if (l.list_price != null) {
      const paidPrice = l.comped_at ? (l.original_price ?? 0) : l.price_snapshot;
      r.priceRuleDiscount += (l.list_price - paidPrice) * l.quantity;
    }
  }
  for (const k of Object.keys(r) as (keyof ZReport)[]) r[k] = roundMoney(r[k]);
  return r;
}
