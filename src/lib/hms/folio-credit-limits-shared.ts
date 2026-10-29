import type { FolioLineRow } from "@/lib/hms/folio";

/*
 * Credit limits: how much a guest can owe before the front desk is warned. No server code, so the
 * bill and the board can both use it. The hotel sets a default; a stay can have its own instead.
 */

/** Warn once the guest's balance reaches this share of the limit. */
export const CREDIT_NEAR_SHARE = 0.8;

export type CreditLimitState = {
  /** The limit that applies, or null when there is none. */
  limit: number | null;
  /** Where it came from: this stay's own limit or the hotel's default. */
  source: "stay" | "default" | null;
  /** What the guest owes on their own window. */
  balance: number;
  level: "none" | "ok" | "near" | "over";
  overBy: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** The guest's own share of the bill: charges sent to a company or agent window don't count. */
export function guestOwes(lines: Pick<FolioLineRow, "amount" | "voided_at" | "split_leg">[]) {
  return round(lines.filter((l) => !l.voided_at && l.split_leg === "guest").reduce((sum, l) => sum + l.amount, 0));
}

export function creditLimitState(
  lines: Pick<FolioLineRow, "amount" | "voided_at" | "split_leg">[],
  stayLimit: number | null | undefined,
  defaultLimit: number | null | undefined,
): CreditLimitState {
  const balance = guestOwes(lines);
  const own = stayLimit != null && stayLimit > 0 ? stayLimit : null;
  const fallback = defaultLimit != null && defaultLimit > 0 ? defaultLimit : null;
  const limit = own ?? fallback;
  if (limit == null) return { limit: null, source: null, balance, level: "none", overBy: 0 };
  const level = balance > limit ? "over" : balance >= limit * CREDIT_NEAR_SHARE ? "near" : "ok";
  return { limit, source: own != null ? "stay" : "default", balance, level, overBy: level === "over" ? round(balance - limit) : 0 };
}
