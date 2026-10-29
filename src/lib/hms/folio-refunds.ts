import type { SupabaseClient } from "@supabase/supabase-js";
import { computeLegBalance, ensureActiveCashFloatSession, type FolioLineRow, type FolioSplitLeg } from "@/lib/hms/folio";
import { postJournalEntry } from "@/lib/hms/journal-entries";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { GUEST_DEPOSITS_ACCOUNT } from "@/lib/hms/folio-deposits";
import { NIGERIA_VAT_RATE_PERCENT } from "@/lib/hms/nigeria-hospitality-taxes";

/*
 * Refunds, recorded. The HMS never sends money back itself: staff hand back cash from the till or
 * reverse a payment on the hotel's card machine, then record it here.
 *
 * - From a guest's bill: up to what that payer has overpaid. The refund is a plus on the bill
 *   (money handed back), cash refunds come out of the open cash float, and the night audit books
 *   them as cash or card leaving against the Guest Ledger.
 * - A deposit on a booking that won't arrive: refunded (out of Advance Guest Deposits to cash or
 *   the card machine) or kept as a cancellation fee (to Room Revenue), booked straight away.
 */

export const REFUND_METHODS = ["cash", "pos"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];
export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = { cash: "cash", pos: "card machine" };

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

async function accountIdByCode(supabase: SupabaseClient, tenantId: string, code: string) {
  const { data } = await supabase.schema("hotel").from("chart_of_accounts").select("id").eq("tenant_id", tenantId).eq("code", code).eq("is_active", true).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** What a payer has paid over their part of the bill, so can be given back. */
export function refundableFor(lines: FolioLineRow[], window: FolioSplitLeg = "guest") {
  return roundMoney(Math.max(0, -computeLegBalance(lines, window)));
}

export type RefundRequest = {
  amount: number;
  method: RefundMethod;
  /** The card machine's reversal slip number; needed for a card-machine refund. */
  posReference?: string | null;
  reason: string;
  window?: FolioSplitLeg;
};

/** Checks a refund against the bill, without recording it. */
export function checkRefund(lines: FolioLineRow[], req: RefundRequest, currency = "NGN"): { ok: true; amount: number } | { ok: false; error: string } {
  const amount = roundMoney(req.amount);
  if (!(amount > 0)) return { ok: false, error: "Enter an amount above zero." };
  if (!req.reason.trim()) return { ok: false, error: "Say why the money is given back." };
  if (req.method === "pos" && !req.posReference?.trim()) {
    return { ok: false, error: "Enter the reversal slip number from the card machine." };
  }
  const max = refundableFor(lines, req.window ?? "guest");
  if (max <= 0) return { ok: false, error: "Nothing has been overpaid, so there's nothing to refund. To take money off the bill, give a discount instead." };
  if (amount > max + 0.005) return { ok: false, error: `That's more than was overpaid. You can give back up to ${formatPricingAmount(max, currency)}.` };
  return { ok: true, amount };
}

/** Records money handed back from a guest's bill. */
export async function recordFolioRefund(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; lines: FolioLineRow[]; request: RefundRequest; userId: string; currency: string },
): Promise<{ ok: true; lineId: string; cashFloatOpened: boolean } | { ok: false; error: string }> {
  const check = checkRefund(params.lines, params.request, params.currency);
  if (!check.ok) return check;
  const { request } = params;

  let cashFloatSessionId: string | null = null;
  let cashFloatOpened = false;
  if (request.method === "cash") {
    const float = await ensureActiveCashFloatSession(supabase, params.tenantId, params.userId);
    if (!float.session) return { ok: false, error: float.error ?? "Open the cash drawer first." };
    cashFloatSessionId = (float.session as { id: string }).id;
    cashFloatOpened = float.created;
  }

  const how = request.method === "pos" ? `card machine, slip ${request.posReference!.trim()}` : "cash";
  const { data, error } = await supabase
    .schema("hotel")
    .from("folio_transactions")
    .insert({
      tenant_id: params.tenantId,
      reservation_id: params.reservationId,
      kind: "refund",
      // A plus: money handed back, so the overpayment it settles goes away.
      amount: check.amount,
      method: request.method,
      status: "posted",
      description: `Refund (${how}): ${request.reason.trim()}`,
      department: null,
      posted_by: params.userId,
      reference: request.method === "pos" ? `pos_reversal:${request.posReference!.trim()}` : null,
      split_leg: request.window ?? "guest",
      currency_code: params.currency,
      cash_float_session_id: cashFloatSessionId,
      metadata: { reason: request.reason.trim(), posReference: request.posReference?.trim() || null, window_set: true },
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "The refund couldn't be recorded." };
  return { ok: true, lineId: data.id as string, cashFloatOpened };
}

export type DepositSettleAction = "refund" | "keep";

/**
 * A kept deposit is a cancellation fee, and VAT is due on it like on the room it was for: the
 * fee includes VAT (7.5%), which goes to Taxes Payable. No VAT when the stay was VAT-exempt.
 */
export function keptDepositSplit(amount: number, vatApplies: boolean) {
  const vat = vatApplies ? roundMoney((amount * NIGERIA_VAT_RATE_PERCENT) / (100 + NIGERIA_VAT_RATE_PERCENT)) : 0;
  return { revenue: roundMoney(amount - vat), vat };
}

/**
 * Settles a deposit on a booking that won't arrive: refunded to the guest, or kept as a
 * cancellation fee. Only a held deposit on a booking that hasn't checked in.
 */
export async function settleDeposit(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    depositId: string;
    action: DepositSettleAction;
    method?: RefundMethod;
    posReference?: string | null;
    reason: string;
    userId: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!params.reason.trim()) return { ok: false, error: params.action === "keep" ? "Say why the deposit is kept." : "Say why the deposit is refunded." };
  if (params.action === "refund" && !params.method) return { ok: false, error: "Choose how the money is given back." };
  if (params.action === "refund" && params.method === "pos" && !params.posReference?.trim()) {
    return { ok: false, error: "Enter the reversal slip number from the card machine." };
  }

  const { data: d } = await supabase
    .schema("hotel")
    .from("reservation_deposits")
    .select("id,amount,status,reservation_id,reservations(confirmation_code,status,vat_applicable,tax_exempt)")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.depositId)
    .maybeSingle();
  if (!d) return { ok: false, error: "That deposit wasn't found." };
  if (d.status !== "held") return { ok: false, error: "This deposit has already been settled." };
  type ResEmbed = { confirmation_code: string; status: string; vat_applicable: boolean | null; tax_exempt: boolean | null };
  const resEmbed = d.reservations as ResEmbed | ResEmbed[] | null;
  const res = Array.isArray(resEmbed) ? resEmbed[0] : resEmbed;
  if (res?.status === "checked_in" || res?.status === "checked_out") {
    return { ok: false, error: "The guest has checked in, so this deposit is on their bill. Refund it from the bill instead." };
  }

  const amount = roundMoney(Number(d.amount));
  const split = keptDepositSplit(amount, params.action === "keep" && res?.vat_applicable !== false && res?.tax_exempt !== true);
  const [deposits, other, taxes] = await Promise.all([
    accountIdByCode(supabase, params.tenantId, GUEST_DEPOSITS_ACCOUNT),
    accountIdByCode(supabase, params.tenantId, params.action === "keep" ? "4000" : params.method === "cash" ? "1000" : "1020"),
    split.vat > 0 ? accountIdByCode(supabase, params.tenantId, "2200") : Promise.resolve(null),
  ]);
  if (!deposits || !other) return { ok: false, error: "Add the Advance Guest Deposits (2300) and matching accounts in Chart of accounts first." };
  if (split.vat > 0 && !taxes) return { ok: false, error: "Add the Taxes Payable (2200) account in Chart of accounts first, for the VAT on the fee." };

  let cashFloatSessionId: string | null = null;
  if (params.action === "refund" && params.method === "cash") {
    const float = await ensureActiveCashFloatSession(supabase, params.tenantId, params.userId);
    if (!float.session) return { ok: false, error: float.error ?? "Open the cash drawer first." };
    cashFloatSessionId = (float.session as { id: string }).id;
  }

  // Claim the deposit first, so two people can't settle it at once.
  const { data: claimed } = await supabase
    .schema("hotel")
    .from("reservation_deposits")
    .update({
      status: params.action === "keep" ? "kept" : "refunded",
      settled_at: new Date().toISOString(),
      settled_by: params.userId,
      settle_method: params.action === "refund" ? params.method : null,
      settle_reference: params.posReference?.trim() || null,
      settle_reason: params.reason.trim(),
      settle_cash_float_session_id: cashFloatSessionId,
    })
    .eq("id", d.id)
    .eq("status", "held")
    .select("id");
  if (!claimed?.length) return { ok: false, error: "This deposit has already been settled." };

  const posted = await postJournalEntry(supabase, {
    tenantId: params.tenantId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo:
      params.action === "keep"
        ? `Deposit kept as a cancellation fee, booking ${res?.confirmation_code ?? ""}: ${params.reason.trim()}`
        : `Deposit refunded (${REFUND_METHOD_LABEL[params.method!]}), booking ${res?.confirmation_code ?? ""}: ${params.reason.trim()}`,
    reference: d.id as string,
    createdBy: params.userId,
    lines:
      params.action === "keep" && split.vat > 0
        ? [
            { accountId: deposits, department: "Front Desk", debit: amount, credit: 0 },
            { accountId: other, department: "Front Desk", debit: 0, credit: split.revenue },
            { accountId: taxes!, department: "Front Desk", debit: 0, credit: split.vat },
          ]
        : [
            { accountId: deposits, department: "Front Desk", debit: amount, credit: 0 },
            { accountId: other, department: "Front Desk", debit: 0, credit: amount },
          ],
  });
  if (!posted.ok) {
    // Never record a settlement the books don't show.
    await supabase
      .schema("hotel")
      .from("reservation_deposits")
      .update({ status: "held", settled_at: null, settled_by: null, settle_method: null, settle_reference: null, settle_reason: null, settle_cash_float_session_id: null })
      .eq("id", d.id);
    return { ok: false, error: `The deposit couldn't be booked: ${posted.error}` };
  }
  await supabase.schema("hotel").from("reservation_deposits").update({ settle_journal_entry_id: posted.id }).eq("id", d.id);
  return { ok: true };
}

/**
 * What should be in the till for a cash float session: the opening amount, plus cash taken on
 * bills and as deposits, less cash given back from bills and from deposits.
 */
export async function expectedCashInFloat(supabase: SupabaseClient, session: { id: string; opening_balance: number | string }) {
  const [{ data: folioLines }, { data: depositsIn }, { data: depositsOut }] = await Promise.all([
    supabase.schema("hotel").from("folio_transactions").select("kind,amount").eq("cash_float_session_id", session.id).in("kind", ["payment", "refund"]).is("voided_at", null),
    supabase.schema("hotel").from("reservation_deposits").select("amount").eq("cash_float_session_id", session.id),
    supabase.schema("hotel").from("reservation_deposits").select("amount").eq("settle_cash_float_session_id", session.id).eq("status", "refunded"),
  ]);
  let cash = Number(session.opening_balance) || 0;
  for (const l of folioLines ?? []) {
    const amount = Math.abs(Number(l.amount) || 0);
    cash += l.kind === "payment" ? amount : -amount;
  }
  for (const d of depositsIn ?? []) cash += Number(d.amount) || 0;
  for (const d of depositsOut ?? []) cash -= Number(d.amount) || 0;
  return roundMoney(cash);
}

export type CardTakings = { bills: number; deposits: number; restaurant: number; refunds: number; total: number };

/** Adds up card-machine money: taken on bills, as deposits and at the restaurant, less given back. Pure, for tests. */
export function sumCardTakings(input: {
  folioLines: { kind: string; amount: number | string }[];
  depositsIn: { amount: number | string }[];
  depositsOut: { amount: number | string }[];
  fbOrders: { subtotal: number | string }[];
}): CardTakings {
  const abs = (v: number | string) => Math.abs(Number(v) || 0);
  let bills = 0;
  let refunds = 0;
  for (const l of input.folioLines) {
    if (l.kind === "payment") bills += abs(l.amount);
    else if (l.kind === "refund") refunds += abs(l.amount);
  }
  const depositsOut = input.depositsOut.reduce((s, d) => s + abs(d.amount), 0);
  const deposits = input.depositsIn.reduce((s, d) => s + abs(d.amount), 0);
  const restaurant = input.fbOrders.reduce((s, o) => s + abs(o.subtotal), 0);
  return {
    bills: roundMoney(bills),
    deposits: roundMoney(deposits),
    restaurant: roundMoney(restaurant),
    refunds: roundMoney(refunds + depositsOut),
    total: roundMoney(bills + deposits + restaurant - refunds - depositsOut),
  };
}

/**
 * What the card machine's end-of-day report should show for a cash float session: card and POS
 * payments on bills, card deposits and card sales at the restaurant since the float was opened,
 * less card-machine refunds. Staff compare it with the machine's own total when they close.
 */
export async function expectedCardInFloat(supabase: SupabaseClient, session: { tenant_id: string; opened_at: string }, until = new Date().toISOString()) {
  const t = session.tenant_id;
  const from = session.opened_at;
  const [{ data: folioLines }, { data: depositsIn }, { data: depositsOut }, { data: fbOrders }] = await Promise.all([
    supabase.schema("hotel").from("folio_transactions").select("kind,amount").eq("tenant_id", t).in("kind", ["payment", "refund"]).in("method", ["card", "pos"]).is("voided_at", null).gte("created_at", from).lt("created_at", until),
    supabase.schema("hotel").from("reservation_deposits").select("amount").eq("tenant_id", t).in("method", ["card", "pos"]).gte("received_at", from).lt("received_at", until),
    supabase.schema("hotel").from("reservation_deposits").select("amount").eq("tenant_id", t).eq("status", "refunded").eq("settle_method", "pos").gte("settled_at", from).lt("settled_at", until),
    supabase.schema("hotel").from("fb_orders").select("subtotal").eq("tenant_id", t).eq("status", "closed").in("settlement_method", ["card", "pos"]).gte("closed_at", from).lt("closed_at", until),
  ]);
  return sumCardTakings({ folioLines: folioLines ?? [], depositsIn: depositsIn ?? [], depositsOut: depositsOut ?? [], fbOrders: fbOrders ?? [] });
}
